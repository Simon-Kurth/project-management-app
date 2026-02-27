/**
 * Jira Local-First Data Pipeline
 *
 * Design principle: ALL aggregation, transformation, and KPI computation happens
 * here in TypeScript — NEVER send raw Jira issue arrays to an LLM.
 *
 * Token budget strategy:
 *   1. Fetch raw issues from Jira API (paginated, with ETag HTTP caching)
 *   2. Compute all KPIs deterministically in pure functions below
 *   3. Persist only the final numeric/string KPI values to PostgreSQL
 *   4. Dashboard tRPC procedures read from DB — zero Jira API calls on page load
 *   5. If LLM insight is ever needed, pass ONLY the pre-computed KPI summary
 *      (< 500 tokens), never raw issue data (potentially 100k+ tokens)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    issuetype: { name: string };
    priority: { name: string };
    story_points?: number;
    customfield_10016?: number; // story points (cloud)
    customfield_10028?: number; // story points (server)
    created: string;
    resolutiondate: string | null;
    updated: string;
    fixVersions: Array<{ name: string; releaseDate?: string; released: boolean }>;
    labels: string[];
    assignee: { displayName: string; accountId: string } | null;
    components: Array<{ name: string }>;
  };
  changelog?: {
    histories: Array<{
      created: string;
      items: Array<{ field: string; fromString: string; toString: string }>;
    }>;
  };
}

export interface JiraSprint {
  id: number;
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
  date: string; // ISO date
  remaining: number;
  ideal: number;
}

export interface CycleTimeStats {
  median: number; // hours
  p75: number;
  p95: number;
  mean: number;
  byType: Record<string, number>; // issue type → median hours
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
  bugDensity: number; // bugs per 100 story points
  escapedDefects: number; // bugs found in prod (label: "escaped")
}

export interface ThroughputMetrics {
  issuesClosedThisWeek: number;
  rollingAvg8Week: number;
  weeklyTrend: Array<{ week: string; count: number }>;
}

export interface ComputedDeliveryKPIs {
  velocity: SprintVelocityPoint[];
  activeSprint: JiraSprint | null;
  burndown: BurndownPoint[];
  cycleTime: CycleTimeStats;
  throughput: ThroughputMetrics;
  deploymentFrequency: DeploymentFrequency;
  bugs: BugMetrics;
  computedAt: string;
  boardId: string;
}

// ---------------------------------------------------------------------------
// HTTP client with ETag caching (avoids re-fetching unchanged data)
// ---------------------------------------------------------------------------

interface CacheEntry {
  etag: string;
  data: unknown;
  fetchedAt: number;
}

const httpCache = new Map<string, CacheEntry>();

async function jiraFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();
  const cached = httpCache.get(cacheKey);

  const headers: Record<string, string> = {
    Authorization: `Basic ${token}`,
    Accept: "application/json",
  };
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const res = await fetch(url.toString(), { headers });

  if (res.status === 304 && cached) {
    // Not modified — return cached data, zero bandwidth used
    return cached.data as T;
  }

  if (!res.ok) {
    throw new Error(`Jira API error ${res.status} for ${path}: ${await res.text()}`);
  }

  const data = await res.json() as T;
  const etag = res.headers.get("etag") ?? "";
  if (etag) {
    httpCache.set(cacheKey, { etag, data, fetchedAt: Date.now() });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Paginated issue fetcher — fetches ALL matching issues in batches of 100
// Returns only the fields we need, keeping memory footprint minimal
// ---------------------------------------------------------------------------

async function fetchAllIssues(
  baseUrl: string,
  token: string,
  jql: string,
  fields: string[],
  expand: string[] = []
): Promise<JiraIssue[]> {
  const allIssues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const page = await jiraFetch<{ issues: JiraIssue[]; total: number; maxResults: number }>(
      baseUrl,
      token,
      "/rest/api/3/search",
      {
        jql,
        startAt,
        maxResults,
        fields: fields.join(","),
        expand: expand.join(","),
      }
    );

    allIssues.push(...page.issues);

    if (allIssues.length >= page.total || page.issues.length === 0) break;
    startAt += maxResults;
  }

  return allIssues;
}

// ---------------------------------------------------------------------------
// Pure aggregation functions — deterministic, testable, zero API calls
// ---------------------------------------------------------------------------

/**
 * Extract story points from an issue, checking all common custom field names.
 * Returns 0 if no story points are set (unestimated issues).
 */
function storyPoints(issue: JiraIssue): number {
  return (
    issue.fields.story_points ??
    issue.fields.customfield_10016 ??
    issue.fields.customfield_10028 ??
    0
  );
}

/**
 * Compute sprint velocity for the last N closed sprints.
 * "Committed" = all issues in sprint at start; "Completed" = done at end.
 */
export function computeVelocity(
  sprints: JiraSprint[],
  issuesBySprint: Map<number, JiraIssue[]>
): SprintVelocityPoint[] {
  return sprints
    .filter((s) => s.state === "closed")
    .slice(-8) // last 8 sprints
    .map((sprint) => {
      const issues = issuesBySprint.get(sprint.id) ?? [];
      const committed = issues.reduce((sum, i) => sum + storyPoints(i), 0);
      const completed = issues
        .filter((i) => i.fields.status.statusCategory.key === "done")
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

/**
 * Compute burndown chart for the active sprint.
 * Walks the changelog to reconstruct remaining story points per day.
 */
export function computeBurndown(
  sprint: JiraSprint,
  issues: JiraIssue[]
): BurndownPoint[] {
  const start = new Date(sprint.startDate);
  const end = sprint.completeDate
    ? new Date(sprint.completeDate)
    : new Date(sprint.endDate);

  const totalPoints = issues.reduce((sum, i) => sum + storyPoints(i), 0);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

  // Build a map of date → points completed on that day
  const completedByDay = new Map<string, number>();

  for (const issue of issues) {
    if (!issue.changelog) continue;
    for (const history of issue.changelog.histories) {
      const histDate = history.created.slice(0, 10);
      for (const item of history.items) {
        if (
          item.field === "status" &&
          item.toString?.toLowerCase().includes("done")
        ) {
          const pts = storyPoints(issue);
          completedByDay.set(histDate, (completedByDay.get(histDate) ?? 0) + pts);
        }
      }
    }
  }

  // Walk day by day, accumulating completed points
  const result: BurndownPoint[] = [];
  let remaining = totalPoints;

  for (let d = 0; d <= days; d++) {
    const date = new Date(start.getTime() + d * 86_400_000);
    const dateStr = date.toISOString().slice(0, 10);
    const completedToday = completedByDay.get(dateStr) ?? 0;
    remaining -= completedToday;

    const ideal = Math.round(totalPoints * (1 - d / days));
    result.push({ date: dateStr, remaining: Math.max(0, remaining), ideal });
  }

  return result;
}

/**
 * Compute cycle time statistics from issue changelogs.
 * Cycle time = time from first "In Progress" transition to "Done".
 * Returns median, p75, p95 in hours — all computed locally.
 */
export function computeCycleTime(issues: JiraIssue[]): CycleTimeStats {
  const cycleTimes: number[] = [];
  const byType: Record<string, number[]> = {};
  const byPriority: Record<string, number[]> = {};

  for (const issue of issues) {
    if (!issue.changelog) continue;

    let inProgressAt: Date | null = null;
    let doneAt: Date | null = null;

    // Walk changelog in chronological order
    const histories = [...issue.changelog.histories].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );

    for (const history of histories) {
      for (const item of history.items) {
        if (item.field !== "status") continue;
        const to = item.toString?.toLowerCase() ?? "";
        if (to.includes("progress") && !inProgressAt) {
          inProgressAt = new Date(history.created);
        }
        if (to.includes("done") || to.includes("closed") || to.includes("resolved")) {
          doneAt = new Date(history.created);
        }
      }
    }

    if (!inProgressAt || !doneAt) continue;

    const hours = (doneAt.getTime() - inProgressAt.getTime()) / 3_600_000;
    if (hours < 0) continue;

    cycleTimes.push(hours);

    const type = issue.fields.issuetype.name;
    if (!byType[type]) byType[type] = [];
    byType[type].push(hours);

    const priority = issue.fields.priority?.name ?? "Unknown";
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
    mean: cycleTimes.length > 0
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

/**
 * Compute deployment frequency from Fix Version release dates.
 * No LLM needed — pure date arithmetic.
 */
export function computeDeploymentFrequency(issues: JiraIssue[]): DeploymentFrequency {
  // Collect all unique release dates from fixVersions
  const releaseDates: Date[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    for (const fv of issue.fields.fixVersions ?? []) {
      if (fv.released && fv.releaseDate && !seen.has(fv.name)) {
        seen.add(fv.name);
        releaseDates.push(new Date(fv.releaseDate));
      }
    }
  }

  releaseDates.sort((a, b) => a.getTime() - b.getTime());

  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 86_400_000);
  const last30 = new Date(now.getTime() - 30 * 86_400_000);

  const releasesLast7Days = releaseDates.filter((d) => d >= last7).length;
  const releasesLast30Days = releaseDates.filter((d) => d >= last30).length;

  // Weekly trend — last 8 weeks
  const weeklyTrend: Array<{ week: string; count: number }> = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86_400_000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000);
    const count = releaseDates.filter((d) => d >= weekStart && d < weekEnd).length;
    weeklyTrend.push({
      week: weekStart.toISOString().slice(0, 10),
      count,
    });
  }

  // Average days between releases
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
    releasesLast30Days,
    releasesLast7Days,
    weeklyTrend,
    avgDaysBetweenReleases: avgDaysBetween,
  };
}

/**
 * Compute bug metrics — all counts done locally, never sent to LLM.
 */
export function computeBugMetrics(
  allIssues: JiraIssue[],
  sprintIssues: JiraIssue[],
  totalSprintPoints: number
): BugMetrics {
  const bugs = allIssues.filter(
    (i) => i.fields.issuetype.name.toLowerCase().includes("bug")
  );
  const openBugs = bugs.filter(
    (i) => i.fields.status.statusCategory.key !== "done"
  );

  const priorityCount = (priority: string) =>
    openBugs.filter(
      (i) => i.fields.priority?.name?.toLowerCase() === priority.toLowerCase()
    ).length;

  const closedThisSprint = sprintIssues.filter(
    (i) =>
      i.fields.issuetype.name.toLowerCase().includes("bug") &&
      i.fields.status.statusCategory.key === "done"
  ).length;

  const escapedDefects = openBugs.filter((i) =>
    i.fields.labels?.includes("escaped")
  ).length;

  return {
    openCritical: priorityCount("critical") + priorityCount("blocker"),
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

/**
 * Compute weekly throughput — issues closed per week, rolling 8-week window.
 */
export function computeThroughput(issues: JiraIssue[]): ThroughputMetrics {
  const now = new Date();
  const weeklyTrend: Array<{ week: string; count: number }> = [];

  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86_400_000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000);

    const count = issues.filter((i) => {
      if (!i.fields.resolutiondate) return false;
      const resolved = new Date(i.fields.resolutiondate);
      return resolved >= weekStart && resolved < weekEnd;
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
// Main connector class — orchestrates fetch + aggregate + return KPIs
// ---------------------------------------------------------------------------

export class JiraConnector {
  private baseUrl: string;
  private token: string; // Base64("email:apitoken")
  private boardId: string;
  private projectKey: string;

  constructor() {
    const email = process.env.JIRA_EMAIL ?? "";
    const apiToken = process.env.JIRA_API_TOKEN ?? "";
    this.baseUrl = (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
    this.token = Buffer.from(`${email}:${apiToken}`).toString("base64");
    this.boardId = process.env.JIRA_BOARD_ID ?? "";
    this.projectKey = process.env.JIRA_PROJECT_KEY ?? "";
  }

  isConfigured(): boolean {
    return !!(
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN &&
      process.env.JIRA_BOARD_ID &&
      process.env.JIRA_PROJECT_KEY
    );
  }

  /**
   * Fetch all sprints for the board (uses ETag caching).
   */
  async fetchSprints(state?: "active" | "closed" | "future"): Promise<JiraSprint[]> {
    const allSprints: JiraSprint[] = [];
    let startAt = 0;

    while (true) {
      const page = await jiraFetch<{ values: JiraSprint[]; isLast: boolean }>(
        this.baseUrl,
        this.token,
        `/rest/agile/1.0/board/${this.boardId}/sprint`,
        {
          startAt,
          maxResults: 50,
          ...(state ? { state } : {}),
        }
      );
      allSprints.push(...page.values);
      if (page.isLast || page.values.length === 0) break;
      startAt += 50;
    }

    return allSprints;
  }

  /**
   * Fetch all issues for a specific sprint.
   * Only requests the fields we actually use — minimises response payload.
   */
  async fetchSprintIssues(sprintId: number, withChangelog = false): Promise<JiraIssue[]> {
    const fields = [
      "summary",
      "status",
      "issuetype",
      "priority",
      "story_points",
      "customfield_10016",
      "customfield_10028",
      "created",
      "resolutiondate",
      "updated",
      "fixVersions",
      "labels",
      "assignee",
      "components",
    ];

    return fetchAllIssues(
      this.baseUrl,
      this.token,
      `sprint = ${sprintId} AND project = "${this.projectKey}"`,
      fields,
      withChangelog ? ["changelog"] : []
    );
  }

  /**
   * Fetch all issues for the project (last 90 days) for throughput + bug metrics.
   * Uses a narrow JQL to avoid pulling the entire backlog.
   */
  async fetchRecentIssues(daysBack = 90): Promise<JiraIssue[]> {
    const since = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString()
      .slice(0, 10);

    return fetchAllIssues(
      this.baseUrl,
      this.token,
      `project = "${this.projectKey}" AND updated >= "${since}"`,
      [
        "summary",
        "status",
        "issuetype",
        "priority",
        "story_points",
        "customfield_10016",
        "customfield_10028",
        "created",
        "resolutiondate",
        "fixVersions",
        "labels",
        "components",
      ],
      ["changelog"]
    );
  }

  /**
   * Master method: fetch all data, compute all KPIs locally, return the result.
   *
   * Token cost: ZERO — no LLM calls.
   * Network cost: minimised via ETag caching and narrow field selection.
   * DB writes: caller persists the returned ComputedDeliveryKPIs object.
   */
  async computeAllKPIs(): Promise<ComputedDeliveryKPIs> {
    if (!this.isConfigured()) {
      throw new Error(
        "Jira connector not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BOARD_ID, JIRA_PROJECT_KEY."
      );
    }

    // 1. Fetch sprints
    const [closedSprints, activeSprints] = await Promise.all([
      this.fetchSprints("closed"),
      this.fetchSprints("active"),
    ]);

    const activeSprint = activeSprints[0] ?? null;
    const recentClosed = closedSprints.slice(-8);

    // 2. Fetch issues for recent sprints (for velocity)
    const sprintIssueMap = new Map<number, JiraIssue[]>();
    await Promise.all(
      recentClosed.map(async (sprint) => {
        const issues = await this.fetchSprintIssues(sprint.id);
        sprintIssueMap.set(sprint.id, issues);
      })
    );

    // 3. Fetch active sprint issues with changelog (for burndown + cycle time)
    let activeSprintIssues: JiraIssue[] = [];
    if (activeSprint) {
      activeSprintIssues = await this.fetchSprintIssues(activeSprint.id, true);
      sprintIssueMap.set(activeSprint.id, activeSprintIssues);
    }

    // 4. Fetch recent project issues (for throughput, bugs, deployment freq, cycle time)
    const recentIssues = await this.fetchRecentIssues(90);

    // 5. Compute all KPIs locally — pure functions, no API calls
    const allSprints = [...recentClosed, ...(activeSprint ? [activeSprint] : [])];
    const velocity = computeVelocity(allSprints, sprintIssueMap);

    const burndown = activeSprint
      ? computeBurndown(activeSprint, activeSprintIssues)
      : [];

    const cycleTime = computeCycleTime(recentIssues);

    const deploymentFrequency = computeDeploymentFrequency(recentIssues);

    const activeSprintPoints = activeSprintIssues.reduce(
      (sum, i) => sum + storyPoints(i),
      0
    );
    const bugs = computeBugMetrics(recentIssues, activeSprintIssues, activeSprintPoints);

    const throughput = computeThroughput(recentIssues);

    return {
      velocity,
      activeSprint,
      burndown,
      cycleTime,
      throughput,
      deploymentFrequency,
      bugs,
      computedAt: new Date().toISOString(),
      boardId: this.boardId,
    };
  }
}
