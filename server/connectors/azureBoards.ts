/**
 * Azure Boards Local-First Data Pipeline
 *
 * Design principle: ALL aggregation, transformation, and KPI computation happens
 * here in TypeScript — NEVER send raw work item arrays to an LLM.
 *
 * Token budget strategy:
 *   1. Fetch raw work items from Azure DevOps REST API (paginated, with ETag HTTP caching)
 *   2. Compute all KPIs deterministically in pure functions below
 *   3. Persist only the final numeric/string KPI values to SQL Server
 *   4. Dashboard tRPC procedures read from DB — zero Azure API calls on page load
 *   5. If LLM insight is ever needed, pass ONLY the pre-computed KPI summary
 *      (< 500 tokens), never raw work item data (potentially 100k+ tokens)
 *
 * Required environment variables:
 *   AZURE_DEVOPS_ORG          — organisation name (e.g. "mycompany")
 *   AZURE_DEVOPS_PROJECT      — project name (e.g. "MyProject")
 *   AZURE_DEVOPS_PAT          — Personal Access Token
 *   AZURE_DEVOPS_TEAM         — team name (defaults to "{project} Team")
 */

// ---------------------------------------------------------------------------
// Types — Azure DevOps API shapes
// ---------------------------------------------------------------------------

interface AzureIteration {
  id: string;  // GUID
  name: string;
  path: string;
  attributes: {
    startDate: string | null;
    finishDate: string | null;
    timeFrame: "past" | "current" | "future";
  };
}

interface AzureWorkItemRef {
  id: number;
  url: string;
}

interface AzureWorkItemFields {
  "System.Id": number;
  "System.Title": string;
  "System.State": string;
  "System.WorkItemType": string;
  "Microsoft.VSTS.Common.Priority": number | null;
  "Microsoft.VSTS.Scheduling.StoryPoints": number | null;
  "System.CreatedDate": string;
  "Microsoft.VSTS.Common.ResolvedDate": string | null;
  "System.ChangedDate": string;
  "System.Tags": string | null;
  "System.AreaPath": string;
  "System.AssignedTo": { displayName: string; id: string } | null;
  "Microsoft.VSTS.Common.StateChangeDate": string | null;
}

interface AzureWorkItem {
  id: number;
  fields: AzureWorkItemFields;
}

interface AzureWorkItemRevision {
  id: number;
  rev: number;
  fields: Partial<AzureWorkItemFields> & {
    "System.ChangedDate": string;
    "System.State"?: string;
  };
}

// ---------------------------------------------------------------------------
// Output types — shared KPI shape used by the scheduler, routers, and DB layer.
// ---------------------------------------------------------------------------

export interface AzureIteration_Sprint {
  id: number;   // numeric handle derived from iteration index
  guid: string; // actual Azure iteration GUID
  name: string;
  state: "active" | "closed" | "future";
  startDate: string;
  endDate: string;
  completeDate?: string;
  goal?: string;
}

export interface SprintVelocityPoint {
  sprint: string;
  sprintId: number;
  committed: number;
  completed: number;
  completionRate: number;
}

export interface BurndownPoint {
  date: string;    // ISO date
  remaining: number;
  ideal: number;
}

export interface CycleTimeStats {
  median: number;  // hours
  p75: number;
  p95: number;
  mean: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface DeploymentFrequency {
  releasesLast30Days: number;
  releasesLast7Days: number;
  weeklyTrend: Array<{ week: string; count: number }>;
  avgDaysBetweenReleases: number;
}

export interface BugMetrics {
  openCritical: number;
  openHigh: number;
  openMedium: number;
  openLow: number;
  openTotal: number;
  closedThisSprint: number;
  bugDensity: number;
  escapedDefects: number;
}

export interface ThroughputMetrics {
  issuesClosedThisWeek: number;
  rollingAvg8Week: number;
  weeklyTrend: Array<{ week: string; count: number }>;
}

export interface ComputedDeliveryKPIs {
  velocity: SprintVelocityPoint[];
  activeSprint: AzureIteration_Sprint | null;
  burndown: BurndownPoint[];
  cycleTime: CycleTimeStats;
  throughput: ThroughputMetrics;
  deploymentFrequency: DeploymentFrequency;
  bugs: BugMetrics;
  computedAt: string;
  boardId: string;
}

// ---------------------------------------------------------------------------
// HTTP client with ETag caching
// ---------------------------------------------------------------------------

interface CacheEntry {
  etag: string;
  data: unknown;
  fetchedAt: number;
}

const httpCache = new Map<string, CacheEntry>();

async function adoFetch<T>(
  token: string,
  url: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> {
  const cached = httpCache.get(url);
  const headers: Record<string, string> = {
    Authorization: `Basic ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (options.method !== "POST" && cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 304 && cached) {
    return cached.data as T;
  }

  if (!res.ok) {
    throw new Error(`Azure DevOps API error ${res.status} for ${url}: ${await res.text()}`);
  }

  const data = await res.json() as T;
  const etag = res.headers.get("etag") ?? "";
  if (etag && options.method !== "POST") {
    httpCache.set(url, { etag, data, fetchedAt: Date.now() });
  }
  return data;
}

// ---------------------------------------------------------------------------
// State category helpers
// ---------------------------------------------------------------------------

const DONE_STATES = new Set([
  "closed", "resolved", "done", "completed", "removed",
]);
const IN_PROGRESS_STATES = new Set([
  "active", "in progress", "in review", "committed", "open",
]);

function stateCategory(state: string): "done" | "in-progress" | "todo" {
  const lower = state.toLowerCase();
  if (DONE_STATES.has(lower)) return "done";
  if (IN_PROGRESS_STATES.has(lower)) return "in-progress";
  return "todo";
}

function storyPoints(item: AzureWorkItem): number {
  return item.fields["Microsoft.VSTS.Scheduling.StoryPoints"] ?? 0;
}

function priorityLabel(item: AzureWorkItem): string {
  const p = item.fields["Microsoft.VSTS.Common.Priority"];
  if (p === null || p === undefined) return "Unknown";
  if (p <= 1) return "Critical";
  if (p === 2) return "High";
  if (p === 3) return "Medium";
  return "Low";
}

function workItemTags(item: AzureWorkItem): string[] {
  const raw = item.fields["System.Tags"] ?? "";
  return raw.split(";").map((t) => t.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Pure aggregation functions
// ---------------------------------------------------------------------------

export function computeVelocity(
  sprints: AzureIteration_Sprint[],
  itemsBySprint: Map<number, AzureWorkItem[]>
): SprintVelocityPoint[] {
  return sprints
    .filter((s) => s.state === "closed")
    .slice(-8)
    .map((sprint) => {
      const items = itemsBySprint.get(sprint.id) ?? [];
      const committed = items.reduce((sum, i) => sum + storyPoints(i), 0);
      const completed = items
        .filter((i) => stateCategory(i.fields["System.State"]) === "done")
        .reduce((sum, i) => sum + storyPoints(i), 0);
      return {
        sprint: sprint.name,
        sprintId: sprint.id,
        committed,
        completed,
        completionRate: committed > 0 ? Math.round((completed / committed) * 100) : 0,
      };
    });
}

export function computeBurndown(
  sprint: AzureIteration_Sprint,
  items: AzureWorkItem[],
  revisionsBySprint: Map<number, AzureWorkItemRevision[]>
): BurndownPoint[] {
  const start = new Date(sprint.startDate);
  const end = sprint.completeDate
    ? new Date(sprint.completeDate)
    : new Date(sprint.endDate);

  const totalPoints = items.reduce((sum, i) => sum + storyPoints(i), 0);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

  // Build a map of date → points completed on that day from revisions
  const completedByDay = new Map<string, number>();

  for (const item of items) {
    const revs = revisionsBySprint.get(item.id) ?? [];
    let prevState = "";
    for (const rev of revs) {
      const revDate = rev.fields["System.ChangedDate"]?.slice(0, 10) ?? "";
      const newState = rev.fields["System.State"] ?? prevState;
      if (
        prevState &&
        stateCategory(prevState) !== "done" &&
        stateCategory(newState) === "done"
      ) {
        const pts = storyPoints(item);
        completedByDay.set(revDate, (completedByDay.get(revDate) ?? 0) + pts);
      }
      prevState = newState;
    }
  }

  const result: BurndownPoint[] = [];
  let remaining = totalPoints;

  for (let d = 0; d <= days; d++) {
    const date = new Date(start.getTime() + d * 86_400_000);
    const dateStr = date.toISOString().slice(0, 10);
    remaining -= completedByDay.get(dateStr) ?? 0;
    result.push({
      date: dateStr,
      remaining: Math.max(0, remaining),
      ideal: Math.round(totalPoints * (1 - d / days)),
    });
  }

  return result;
}

export function computeCycleTime(
  items: AzureWorkItem[],
  revisionsByItem: Map<number, AzureWorkItemRevision[]>
): CycleTimeStats {
  const cycleTimes: number[] = [];
  const byType: Record<string, number[]> = {};
  const byPriority: Record<string, number[]> = {};

  for (const item of items) {
    const revs = (revisionsByItem.get(item.id) ?? []).sort(
      (a, b) =>
        new Date(a.fields["System.ChangedDate"]).getTime() -
        new Date(b.fields["System.ChangedDate"]).getTime()
    );

    let inProgressAt: Date | null = null;
    let doneAt: Date | null = null;
    let prevState = "";

    for (const rev of revs) {
      const newState = rev.fields["System.State"] ?? prevState;
      const changedAt = new Date(rev.fields["System.ChangedDate"]);

      if (
        stateCategory(prevState) === "todo" &&
        stateCategory(newState) === "in-progress" &&
        !inProgressAt
      ) {
        inProgressAt = changedAt;
      }
      if (stateCategory(newState) === "done") {
        doneAt = changedAt;
      }
      prevState = newState;
    }

    if (!inProgressAt || !doneAt) continue;

    const hours = (doneAt.getTime() - inProgressAt.getTime()) / 3_600_000;
    if (hours < 0) continue;

    cycleTimes.push(hours);

    const type = item.fields["System.WorkItemType"];
    if (!byType[type]) byType[type] = [];
    byType[type].push(hours);

    const priority = priorityLabel(item);
    if (!byPriority[priority]) byPriority[priority] = [];
    byPriority[priority].push(hours);
  }

  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, idx)]);
  };

  const median = (arr: number[]): number => percentile(arr, 50);

  return {
    median: median(cycleTimes),
    p75: percentile(cycleTimes, 75),
    p95: percentile(cycleTimes, 95),
    mean:
      cycleTimes.length > 0
        ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
        : 0,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, median(v)])
    ),
    byPriority: Object.fromEntries(
      Object.entries(byPriority).map(([k, v]) => [k, median(v)])
    ),
  };
}

export function computeDeploymentFrequency(
  items: AzureWorkItem[]
): DeploymentFrequency {
  // Use work items tagged "release" or of type "Release" as proxy for deployments.
  // Date used is ResolvedDate or ChangedDate when the item was closed.
  const releaseDates: Date[] = [];

  for (const item of items) {
    const type = item.fields["System.WorkItemType"].toLowerCase();
    const tags = workItemTags(item).map((t) => t.toLowerCase());
    const isRelease = type === "release" || tags.includes("release");
    if (!isRelease) continue;
    if (stateCategory(item.fields["System.State"]) !== "done") continue;

    const dateStr =
      item.fields["Microsoft.VSTS.Common.ResolvedDate"] ??
      item.fields["System.ChangedDate"];
    if (dateStr) releaseDates.push(new Date(dateStr));
  }

  releaseDates.sort((a, b) => a.getTime() - b.getTime());

  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 86_400_000);
  const last30 = new Date(now.getTime() - 30 * 86_400_000);

  const weeklyTrend: Array<{ week: string; count: number }> = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86_400_000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000);
    const count = releaseDates.filter((d) => d >= weekStart && d < weekEnd).length;
    weeklyTrend.push({ week: weekStart.toISOString().slice(0, 10), count });
  }

  let avgDaysBetween = 0;
  if (releaseDates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < releaseDates.length; i++) {
      gaps.push(
        (releaseDates[i].getTime() - releaseDates[i - 1].getTime()) / 86_400_000
      );
    }
    avgDaysBetween = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  return {
    releasesLast30Days: releaseDates.filter((d) => d >= last30).length,
    releasesLast7Days: releaseDates.filter((d) => d >= last7).length,
    weeklyTrend,
    avgDaysBetweenReleases: avgDaysBetween,
  };
}

export function computeBugMetrics(
  allItems: AzureWorkItem[],
  sprintItems: AzureWorkItem[],
  totalSprintPoints: number
): BugMetrics {
  const bugs = allItems.filter(
    (i) => i.fields["System.WorkItemType"].toLowerCase() === "bug"
  );
  const openBugs = bugs.filter(
    (i) => stateCategory(i.fields["System.State"]) !== "done"
  );

  const priorityCount = (label: string) =>
    openBugs.filter((i) => priorityLabel(i).toLowerCase() === label.toLowerCase())
      .length;

  const closedThisSprint = sprintItems.filter(
    (i) =>
      i.fields["System.WorkItemType"].toLowerCase() === "bug" &&
      stateCategory(i.fields["System.State"]) === "done"
  ).length;

  const escapedDefects = openBugs.filter((i) =>
    workItemTags(i).some((t) => t.toLowerCase() === "escaped")
  ).length;

  return {
    openCritical: priorityCount("critical"),
    openHigh: priorityCount("high"),
    openMedium: priorityCount("medium"),
    openLow: priorityCount("low"),
    openTotal: openBugs.length,
    closedThisSprint,
    bugDensity:
      totalSprintPoints > 0
        ? Math.round((openBugs.length / totalSprintPoints) * 100) / 1
        : 0,
    escapedDefects,
  };
}

export function computeThroughput(items: AzureWorkItem[]): ThroughputMetrics {
  const now = new Date();
  const weeklyTrend: Array<{ week: string; count: number }> = [];

  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86_400_000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000);

    const count = items.filter((i) => {
      const resolved = i.fields["Microsoft.VSTS.Common.ResolvedDate"];
      if (!resolved) return false;
      const d = new Date(resolved);
      return d >= weekStart && d < weekEnd;
    }).length;

    weeklyTrend.push({ week: weekStart.toISOString().slice(0, 10), count });
  }

  const counts = weeklyTrend.map((w) => w.count);
  const rollingAvg8Week =
    counts.length > 0
      ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
      : 0;

  return {
    issuesClosedThisWeek: weeklyTrend[weeklyTrend.length - 1]?.count ?? 0,
    rollingAvg8Week,
    weeklyTrend,
  };
}

// ---------------------------------------------------------------------------
// Main connector class
// ---------------------------------------------------------------------------

export class AzureBoardsConnector {
  private org: string;
  private project: string;
  private team: string;
  private token: string;  // base64(":PAT")
  private apiBase: string;
  private teamApiBase: string;

  constructor() {
    this.org     = process.env.AZURE_DEVOPS_ORG ?? "";
    this.project = process.env.AZURE_DEVOPS_PROJECT ?? "";
    const pat    = process.env.AZURE_DEVOPS_PAT ?? "";
    this.team    = process.env.AZURE_DEVOPS_TEAM ?? `${this.project} Team`;
    this.token   = Buffer.from(`:${pat}`).toString("base64");

    const encoded = encodeURIComponent(this.project);
    this.apiBase  = `https://dev.azure.com/${this.org}/${encoded}/_apis`;
    const encodedTeam = encodeURIComponent(this.team);
    this.teamApiBase  = `https://dev.azure.com/${this.org}/${encoded}/${encodedTeam}/_apis`;
  }

  isConfigured(): boolean {
    return !!(
      process.env.AZURE_DEVOPS_ORG &&
      process.env.AZURE_DEVOPS_PROJECT &&
      process.env.AZURE_DEVOPS_PAT
    );
  }

  // --------------------------------------------------------------------------
  // Fetch helpers
  // --------------------------------------------------------------------------

  private async fetchIterations(): Promise<AzureIteration[]> {
    const url = `${this.teamApiBase}/work/teamsettings/iterations?api-version=7.1`;
    const res = await adoFetch<{ value: AzureIteration[] }>(this.token, url);
    return res.value;
  }

  private async fetchIterationWorkItemIds(
    iterationId: string
  ): Promise<number[]> {
    const url = `${this.teamApiBase}/work/teamsettings/iterations/${iterationId}/workitems?api-version=7.1`;
    const res = await adoFetch<{
      workItemRelations: Array<{ target: AzureWorkItemRef | null }>;
    }>(this.token, url);

    return res.workItemRelations
      .map((r) => r.target?.id)
      .filter((id): id is number => id !== undefined && id !== null);
  }

  /**
   * Batch-fetch work item details (max 200 per request per Azure API limits).
   */
  private async fetchWorkItems(
    ids: number[],
    fields: string[]
  ): Promise<AzureWorkItem[]> {
    if (ids.length === 0) return [];
    const results: AzureWorkItem[] = [];
    const batchSize = 200;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const url = `${this.apiBase}/wit/workitemsbatch?api-version=7.1`;
      const res = await adoFetch<{ value: AzureWorkItem[] }>(this.token, url, {
        method: "POST",
        body: { ids: batch, fields },
      });
      results.push(...res.value);
    }

    return results;
  }

  /**
   * Fetch work item revisions for burndown and cycle time computation.
   * Only fetches the fields we need to keep the payload small.
   */
  private async fetchRevisions(id: number): Promise<AzureWorkItemRevision[]> {
    const url = `${this.apiBase}/wit/workitems/${id}/revisions?$expand=fields&api-version=7.1`;
    const res = await adoFetch<{ value: AzureWorkItemRevision[] }>(
      this.token,
      url
    );
    return res.value;
  }

  /**
   * WIQL query to find all work items updated in the last N days.
   */
  private async fetchRecentWorkItemIds(daysBack: number): Promise<number[]> {
    const since = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const url = `${this.apiBase}/wit/wiql?api-version=7.1`;
    const res = await adoFetch<{ workItems: AzureWorkItemRef[] }>(
      this.token,
      url,
      {
        method: "POST",
        body: {
          query: `SELECT [System.Id] FROM WorkItems \
WHERE [System.TeamProject] = '${this.project}' \
AND [System.ChangedDate] >= '${since}' \
ORDER BY [System.ChangedDate] DESC`,
        },
      }
    );
    return (res.workItems ?? []).map((w) => w.id);
  }

  // --------------------------------------------------------------------------
  // Map Azure iteration → normalised sprint shape
  // --------------------------------------------------------------------------

  private toSprint(
    iteration: AzureIteration,
    numericId: number
  ): AzureIteration_Sprint {
    const state =
      iteration.attributes.timeFrame === "current"
        ? "active"
        : iteration.attributes.timeFrame === "future"
        ? "future"
        : "closed";

    return {
      id: numericId,
      guid: iteration.id,
      name: iteration.name,
      state,
      startDate: iteration.attributes.startDate ?? new Date().toISOString(),
      endDate: iteration.attributes.finishDate ?? new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Master KPI computation
  // --------------------------------------------------------------------------

  async computeAllKPIs(): Promise<ComputedDeliveryKPIs> {
    if (!this.isConfigured()) {
      throw new Error(
        "Azure Boards connector not configured. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT."
      );
    }

    // Standard fields to request on every work item fetch
    const FIELDS = [
      "System.Id",
      "System.Title",
      "System.State",
      "System.WorkItemType",
      "Microsoft.VSTS.Common.Priority",
      "Microsoft.VSTS.Scheduling.StoryPoints",
      "System.CreatedDate",
      "Microsoft.VSTS.Common.ResolvedDate",
      "System.ChangedDate",
      "System.Tags",
      "System.AreaPath",
      "System.AssignedTo",
      "Microsoft.VSTS.Common.StateChangeDate",
    ];

    // 1. Fetch all iterations and assign stable numeric IDs (index-based)
    const rawIterations = await this.fetchIterations();
    const sprintMap = new Map<number, AzureIteration_Sprint>();
    const guidToNumericId = new Map<string, number>();

    rawIterations.forEach((iter, idx) => {
      const numId = idx + 1;
      guidToNumericId.set(iter.id, numId);
      sprintMap.set(numId, this.toSprint(iter, numId));
    });

    const allSprints = [...sprintMap.values()];
    const activeSprint = allSprints.find((s) => s.state === "active") ?? null;
    const recentClosed = allSprints.filter((s) => s.state === "closed").slice(-8);

    // 2. Fetch work items for recent closed sprints (velocity)
    const itemsBySprint = new Map<number, AzureWorkItem[]>();

    await Promise.all(
      recentClosed.map(async (sprint) => {
        const rawSprint = rawIterations[sprint.id - 1];
        if (!rawSprint) return;
        const ids = await this.fetchIterationWorkItemIds(rawSprint.id);
        const items = await this.fetchWorkItems(ids, FIELDS);
        itemsBySprint.set(sprint.id, items);
      })
    );

    // 3. Fetch active sprint work items with revisions (burndown + cycle time)
    let activeItems: AzureWorkItem[] = [];
    const revisionsByItem = new Map<number, AzureWorkItemRevision[]>();

    if (activeSprint) {
      const rawActive = rawIterations[activeSprint.id - 1];
      if (rawActive) {
        const ids = await this.fetchIterationWorkItemIds(rawActive.id);
        activeItems = await this.fetchWorkItems(ids, FIELDS);
        itemsBySprint.set(activeSprint.id, activeItems);

        // Fetch revisions for burndown accuracy (limit to 50 items to stay fast)
        await Promise.all(
          activeItems.slice(0, 50).map(async (item) => {
            const revs = await this.fetchRevisions(item.id);
            revisionsByItem.set(item.id, revs);
          })
        );
      }
    }

    // 4. Fetch recent project work items for throughput + bugs + deployment freq + cycle time
    const recentIds = await this.fetchRecentWorkItemIds(90);
    const recentItems = await this.fetchWorkItems(recentIds, FIELDS);

    // Fetch revisions for cycle time computation (limit to 100 items)
    await Promise.all(
      recentItems.slice(0, 100).map(async (item) => {
        if (!revisionsByItem.has(item.id)) {
          const revs = await this.fetchRevisions(item.id);
          revisionsByItem.set(item.id, revs);
        }
      })
    );

    // 5. Compute all KPIs locally — pure functions, no API calls
    const velocity = computeVelocity(
      [...recentClosed, ...(activeSprint ? [activeSprint] : [])],
      itemsBySprint
    );

    const burndown = activeSprint
      ? computeBurndown(activeSprint, activeItems, revisionsByItem)
      : [];

    const cycleTime = computeCycleTime(recentItems, revisionsByItem);
    const deploymentFrequency = computeDeploymentFrequency(recentItems);

    const activeSprintPoints = activeItems.reduce(
      (sum, i) => sum + storyPoints(i),
      0
    );
    const bugs = computeBugMetrics(recentItems, activeItems, activeSprintPoints);
    const throughput = computeThroughput(recentItems);

    return {
      velocity,
      activeSprint,
      burndown,
      cycleTime,
      throughput,
      deploymentFrequency,
      bugs,
      computedAt: new Date().toISOString(),
      boardId: `${this.org}/${this.project}`,
    };
  }
}
