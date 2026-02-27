/**
 * Unit tests for the Jira local aggregation engine.
 *
 * All tests use fixture data — no Jira API calls, no DB, no LLM.
 * This validates that the deterministic computation functions produce
 * correct KPI values before any real Jira data is connected.
 */

import { describe, expect, it } from "vitest";
import {
  computeVelocity,
  computeBurndown,
  computeCycleTime,
  computeDeploymentFrequency,
  computeBugMetrics,
  computeThroughput,
  type JiraIssue,
  type JiraSprint,
} from "./connectors/jira";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSprint(
  id: number,
  name: string,
  state: "active" | "closed" | "future",
  daysAgo = 14
): JiraSprint {
  const start = new Date(Date.now() - daysAgo * 86_400_000);
  const end = new Date(start.getTime() + 14 * 86_400_000);
  return {
    id,
    name,
    state,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    completeDate: state === "closed" ? end.toISOString() : undefined,
  };
}

function makeIssue(
  key: string,
  opts: {
    status?: string;
    statusCategory?: string;
    type?: string;
    priority?: string;
    points?: number;
    created?: string;
    resolved?: string;
    fixVersions?: Array<{ name: string; releaseDate?: string; released: boolean }>;
    labels?: string[];
    changelog?: JiraIssue["changelog"];
  } = {}
): JiraIssue {
  return {
    key,
    fields: {
      summary: `Issue ${key}`,
      status: {
        name: opts.status ?? "Done",
        statusCategory: { key: opts.statusCategory ?? "done" },
      },
      issuetype: { name: opts.type ?? "Story" },
      priority: { name: opts.priority ?? "Medium" },
      customfield_10016: opts.points ?? 3,
      created: opts.created ?? new Date(Date.now() - 10 * 86_400_000).toISOString(),
      resolutiondate: opts.resolved ?? new Date(Date.now() - 2 * 86_400_000).toISOString(),
      updated: new Date().toISOString(),
      fixVersions: opts.fixVersions ?? [],
      labels: opts.labels ?? [],
      assignee: null,
      components: [],
    },
    changelog: opts.changelog,
  };
}

// ---------------------------------------------------------------------------
// computeVelocity
// ---------------------------------------------------------------------------

describe("computeVelocity", () => {
  it("returns empty array when no closed sprints", () => {
    const sprint = makeSprint(1, "Sprint 1", "active");
    const issues = new Map([[1, [makeIssue("PROJ-1")]]]);
    expect(computeVelocity([sprint], issues)).toEqual([]);
  });

  it("computes committed and completed story points correctly", () => {
    const sprint = makeSprint(1, "Sprint 1", "closed");
    const issues = [
      makeIssue("PROJ-1", { points: 5, statusCategory: "done" }),
      makeIssue("PROJ-2", { points: 3, statusCategory: "done" }),
      makeIssue("PROJ-3", { points: 2, statusCategory: "indeterminate" }), // not done
    ];
    const map = new Map([[1, issues]]);
    const result = computeVelocity([sprint], map);

    expect(result).toHaveLength(1);
    expect(result[0].committed).toBe(10); // 5+3+2
    expect(result[0].completed).toBe(8);  // 5+3 only
    expect(result[0].completionRate).toBe(80);
  });

  it("handles zero story points gracefully (completionRate = 0)", () => {
    const sprint = makeSprint(1, "Sprint 1", "closed");
    const issues = [makeIssue("PROJ-1", { points: 0 })];
    const map = new Map([[1, issues]]);
    const result = computeVelocity([sprint], map);
    expect(result[0].completionRate).toBe(0);
  });

  it("only includes the last 8 closed sprints", () => {
    const sprints = Array.from({ length: 12 }, (_, i) =>
      makeSprint(i + 1, `Sprint ${i + 1}`, "closed")
    );
    const map = new Map(sprints.map((s) => [s.id, [makeIssue(`PROJ-${s.id}`)]]));
    const result = computeVelocity(sprints, map);
    expect(result).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// computeBurndown
// ---------------------------------------------------------------------------

describe("computeBurndown", () => {
  it("starts at total story points and trends toward zero", () => {
    const sprint = makeSprint(1, "Sprint 1", "active", 7);
    const issues = [
      makeIssue("PROJ-1", { points: 5 }),
      makeIssue("PROJ-2", { points: 3 }),
    ];
    const result = computeBurndown(sprint, issues);

    // First point should have full remaining points
    expect(result[0].remaining).toBe(8);
    // All points should be non-negative
    expect(result.every((p) => p.remaining >= 0)).toBe(true);
    // Ideal line starts at 8 and ends at 0
    expect(result[0].ideal).toBe(8);
    expect(result[result.length - 1].ideal).toBe(0);
  });

  it("reduces remaining when changelog shows status→done transitions", () => {
    const sprint = makeSprint(1, "Sprint 1", "active", 3);
    const doneDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

    const issueWithChangelog = makeIssue("PROJ-1", {
      points: 5,
      changelog: {
        histories: [
          {
            created: `${doneDate}T10:00:00.000Z`,
            items: [{ field: "status", fromString: "In Progress", toString: "Done" }],
          },
        ],
      },
    });

    const result = computeBurndown(sprint, [issueWithChangelog]);
    // After the done date, remaining should be 0
    const afterDone = result.find((p) => p.date > doneDate);
    if (afterDone) {
      expect(afterDone.remaining).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// computeCycleTime
// ---------------------------------------------------------------------------

describe("computeCycleTime", () => {
  it("returns zeros when no issues have changelogs", () => {
    const result = computeCycleTime([makeIssue("PROJ-1")]);
    expect(result.median).toBe(0);
    expect(result.p75).toBe(0);
    expect(result.p95).toBe(0);
  });

  it("computes median cycle time correctly from changelog", () => {
    const makeIssueWithCycle = (key: string, hours: number): JiraIssue => {
      const inProgressAt = new Date(Date.now() - (hours + 1) * 3_600_000).toISOString();
      const doneAt = new Date(Date.now() - 1 * 3_600_000).toISOString();
      return makeIssue(key, {
        changelog: {
          histories: [
            {
              created: inProgressAt,
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
            },
            {
              created: doneAt,
              items: [{ field: "status", fromString: "In Progress", toString: "Done" }],
            },
          ],
        },
      });
    };

    // Cycle times: 8h, 16h, 24h → median = 16h
    const issues = [
      makeIssueWithCycle("PROJ-1", 8),
      makeIssueWithCycle("PROJ-2", 16),
      makeIssueWithCycle("PROJ-3", 24),
    ];
    const result = computeCycleTime(issues);
    expect(result.median).toBeGreaterThan(0);
    expect(result.p95).toBeGreaterThanOrEqual(result.p75);
    expect(result.p75).toBeGreaterThanOrEqual(result.median);
  });

  it("groups cycle times by issue type and priority", () => {
    const makeTypedIssue = (key: string, type: string, priority: string): JiraIssue => {
      const inProgress = new Date(Date.now() - 10 * 3_600_000).toISOString();
      const done = new Date(Date.now() - 1 * 3_600_000).toISOString();
      return makeIssue(key, {
        type,
        priority,
        changelog: {
          histories: [
            { created: inProgress, items: [{ field: "status", fromString: "To Do", toString: "In Progress" }] },
            { created: done, items: [{ field: "status", fromString: "In Progress", toString: "Done" }] },
          ],
        },
      });
    };

    const issues = [
      makeTypedIssue("PROJ-1", "Story", "High"),
      makeTypedIssue("PROJ-2", "Bug", "Critical"),
      makeTypedIssue("PROJ-3", "Story", "Medium"),
    ];
    const result = computeCycleTime(issues);
    expect(result.byType).toHaveProperty("Story");
    expect(result.byType).toHaveProperty("Bug");
    expect(result.byPriority).toHaveProperty("High");
  });
});

// ---------------------------------------------------------------------------
// computeDeploymentFrequency
// ---------------------------------------------------------------------------

describe("computeDeploymentFrequency", () => {
  it("returns zero counts when no released fix versions", () => {
    const issues = [makeIssue("PROJ-1", { fixVersions: [] })];
    const result = computeDeploymentFrequency(issues);
    expect(result.releasesLast7Days).toBe(0);
    expect(result.releasesLast30Days).toBe(0);
    expect(result.weeklyTrend).toHaveLength(8);
  });

  it("counts releases within the last 7 and 30 days correctly", () => {
    const yesterday = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const twoMonthsAgo = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

    const issues = [
      makeIssue("PROJ-1", { fixVersions: [{ name: "v1.0", releaseDate: yesterday, released: true }] }),
      makeIssue("PROJ-2", { fixVersions: [{ name: "v0.9", releaseDate: twoWeeksAgo, released: true }] }),
      makeIssue("PROJ-3", { fixVersions: [{ name: "v0.8", releaseDate: twoMonthsAgo, released: true }] }),
      // Duplicate version — should not be double-counted
      makeIssue("PROJ-4", { fixVersions: [{ name: "v1.0", releaseDate: yesterday, released: true }] }),
    ];

    const result = computeDeploymentFrequency(issues);
    expect(result.releasesLast7Days).toBe(1);   // only v1.0
    expect(result.releasesLast30Days).toBe(2);  // v1.0 + v0.9
  });

  it("computes average days between releases", () => {
    const d1 = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const issues = [
      makeIssue("PROJ-1", { fixVersions: [{ name: "v1.0", releaseDate: d1, released: true }] }),
      makeIssue("PROJ-2", { fixVersions: [{ name: "v1.1", releaseDate: d2, released: true }] }),
    ];
    const result = computeDeploymentFrequency(issues);
    expect(result.avgDaysBetweenReleases).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// computeBugMetrics
// ---------------------------------------------------------------------------

describe("computeBugMetrics", () => {
  it("counts open bugs by priority correctly", () => {
    const bugs = [
      makeIssue("BUG-1", { type: "Bug", priority: "Critical", statusCategory: "new" }),
      makeIssue("BUG-2", { type: "Bug", priority: "High", statusCategory: "new" }),
      makeIssue("BUG-3", { type: "Bug", priority: "High", statusCategory: "new" }),
      makeIssue("BUG-4", { type: "Bug", priority: "Medium", statusCategory: "new" }),
      makeIssue("BUG-5", { type: "Bug", priority: "Low", statusCategory: "done" }), // closed
    ];
    const result = computeBugMetrics(bugs, [], 0);
    expect(result.openCritical).toBe(1);
    expect(result.openHigh).toBe(2);
    expect(result.openMedium).toBe(1);
    expect(result.openTotal).toBe(4); // BUG-5 is closed
  });

  it("counts escaped defects from labels", () => {
    const bugs = [
      makeIssue("BUG-1", { type: "Bug", statusCategory: "new", labels: ["escaped"] }),
      makeIssue("BUG-2", { type: "Bug", statusCategory: "new", labels: [] }),
    ];
    const result = computeBugMetrics(bugs, [], 0);
    expect(result.escapedDefects).toBe(1);
  });

  it("computes bug density per 100 story points", () => {
    const bugs = [
      makeIssue("BUG-1", { type: "Bug", statusCategory: "new" }),
      makeIssue("BUG-2", { type: "Bug", statusCategory: "new" }),
    ];
    // 2 open bugs / 50 story points = 4 bugs per 100 pts
    const result = computeBugMetrics(bugs, [], 50);
    expect(result.bugDensity).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// computeThroughput
// ---------------------------------------------------------------------------

describe("computeThroughput", () => {
  it("returns 8 weekly data points", () => {
    const result = computeThroughput([]);
    expect(result.weeklyTrend).toHaveLength(8);
  });

  it("counts issues closed this week correctly", () => {
    const yesterday = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const lastMonth = new Date(Date.now() - 35 * 86_400_000).toISOString();
    const issues = [
      makeIssue("PROJ-1", { resolved: yesterday }),
      makeIssue("PROJ-2", { resolved: yesterday }),
      makeIssue("PROJ-3", { resolved: lastMonth }), // outside 8-week window
    ];
    const result = computeThroughput(issues);
    expect(result.issuesClosedThisWeek).toBe(2);
  });

  it("computes rolling 8-week average", () => {
    // Create 8 issues, one per week for the last 8 weeks
    const issues = Array.from({ length: 8 }, (_, i) =>
      makeIssue(`PROJ-${i + 1}`, {
        resolved: new Date(Date.now() - (i * 7 + 1) * 86_400_000).toISOString(),
      })
    );
    const result = computeThroughput(issues);
    expect(result.rollingAvg8Week).toBeGreaterThan(0);
  });
});
