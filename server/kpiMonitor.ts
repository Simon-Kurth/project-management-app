/**
 * server/kpiMonitor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * KPI Threshold Monitor
 *
 * Runs on a configurable cron schedule (default: every 15 minutes).
 * For each active connector, it reads the latest computed KPIs from the
 * database, compares them against configurable thresholds, and inserts a
 * notification row for every breach detected.
 *
 * Thresholds are defined in the THRESHOLD_RULES array below and can be
 * extended without touching the scheduler logic.
 *
 * Environment variables:
 *   KPI_MONITOR_CRON   Cron expression (default: every 15 minutes)
 *   KPI_MONITOR_ENABLED  Set to "false" to disable (default: enabled)
 */

import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { getLatestComputedKPIs, createNotification, listAllUsers } from "./db";
import type { NotificationSeverity } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

type Comparator = "lt" | "lte" | "gt" | "gte";

interface ThresholdRule {
  /** Human-readable name shown in the notification title */
  name: string;
  /** boardId passed to getLatestComputedKPIs */
  boardId: string;
  /** kpiType passed to getLatestComputedKPIs */
  kpiType: string;
  /** Dot-path into the returned data object, e.g. "velocity.average" */
  metricPath: string;
  /** Comparison operator */
  comparator: Comparator;
  /** Threshold value */
  threshold: number;
  /** Notification severity when breached */
  severity: NotificationSeverity;
  /** Deep-link for the notification action button */
  actionUrl?: string;
  /** Roles that should receive this notification */
  notifyRoles?: string[];
  /** Friendly unit label, e.g. "%" or "pts" */
  unit?: string;
}

// ─── Threshold Rules ──────────────────────────────────────────────────────────
//
// Add new rules here. Each rule is evaluated independently on every monitor run.
// The `boardId` and `kpiType` must match values stored in the computed_kpis table.
//
// To disable a rule without deleting it, set `threshold` to Infinity / -Infinity.

const THRESHOLD_RULES: ThresholdRule[] = [
  // ── Delivery / Jira ────────────────────────────────────────────────────────
  {
    name:        "Sprint Velocity Drop",
    boardId:     "default",
    kpiType:     "delivery",
    metricPath:  "velocity.average",
    comparator:  "lt",
    threshold:   20,
    severity:    "warning",
    actionUrl:   "/dashboard/delivery",
    notifyRoles: ["executive", "admin"],
    unit:        "pts",
  },
  {
    name:        "Cycle Time Spike",
    boardId:     "default",
    kpiType:     "delivery",
    metricPath:  "cycleTime.p50Days",
    comparator:  "gt",
    threshold:   14,
    severity:    "warning",
    actionUrl:   "/dashboard/delivery",
    notifyRoles: ["executive", "admin"],
    unit:        "days",
  },
  {
    name:        "Bug Escape Rate Critical",
    boardId:     "default",
    kpiType:     "delivery",
    metricPath:  "bugEscapeRate",
    comparator:  "gt",
    threshold:   10,
    severity:    "error",
    actionUrl:   "/dashboard/qa",
    notifyRoles: ["executive", "admin", "qa"],
    unit:        "%",
  },
  // ── QA ─────────────────────────────────────────────────────────────────────
  {
    name:        "Test Pass Rate Below Target",
    boardId:     "default",
    kpiType:     "qa",
    metricPath:  "passRate",
    comparator:  "lt",
    threshold:   85,
    severity:    "warning",
    actionUrl:   "/dashboard/qa",
    notifyRoles: ["executive", "admin", "qa"],
    unit:        "%",
  },
  // ── CSM ────────────────────────────────────────────────────────────────────
  {
    name:        "NPS Score Drop",
    boardId:     "default",
    kpiType:     "csm",
    metricPath:  "nps",
    comparator:  "lt",
    threshold:   30,
    severity:    "warning",
    actionUrl:   "/dashboard/csm",
    notifyRoles: ["executive", "admin", "csm"],
    unit:        "pts",
  },
  {
    name:        "Churn Rate Elevated",
    boardId:     "default",
    kpiType:     "csm",
    metricPath:  "churnRate",
    comparator:  "gt",
    threshold:   5,
    severity:    "error",
    actionUrl:   "/dashboard/csm",
    notifyRoles: ["executive", "admin", "csm"],
    unit:        "%",
  },
  // ── Sales ───────────────────────────────────────────────────────────────────
  {
    name:        "Pipeline Coverage Below 3x",
    boardId:     "default",
    kpiType:     "sales",
    metricPath:  "pipelineCoverage",
    comparator:  "lt",
    threshold:   3,
    severity:    "warning",
    actionUrl:   "/dashboard/sales",
    notifyRoles: ["executive", "admin", "sales_marketing"],
    unit:        "x",
  },
  {
    name:        "Win Rate Below Target",
    boardId:     "default",
    kpiType:     "sales",
    metricPath:  "winRate",
    comparator:  "lt",
    threshold:   25,
    severity:    "warning",
    actionUrl:   "/dashboard/sales",
    notifyRoles: ["executive", "admin", "sales_marketing"],
    unit:        "%",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely read a dot-path value from an object, e.g. "velocity.average" */
function getNestedValue(obj: Record<string, unknown>, path: string): number | null {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "number" ? current : null;
}

function compare(value: number, comparator: Comparator, threshold: number): boolean {
  switch (comparator) {
    case "lt":  return value < threshold;
    case "lte": return value <= threshold;
    case "gt":  return value > threshold;
    case "gte": return value >= threshold;
  }
}

function comparatorLabel(c: Comparator): string {
  switch (c) {
    case "lt":  return "below";
    case "lte": return "at or below";
    case "gt":  return "above";
    case "gte": return "at or above";
  }
}

// ─── Monitor run ─────────────────────────────────────────────────────────────

let _running = false;

async function runKpiMonitor(): Promise<void> {
  if (_running) {
    console.log("[KpiMonitor] Previous run still in progress — skipping");
    return;
  }
  _running = true;
  const startMs = Date.now();

  try {
    // Fetch all users once so we can fan out notifications by role
    const allUsers = await listAllUsers();
    if (!allUsers.length) return;

    const usersByRole = new Map<string, number[]>();
    for (const u of allUsers) {
      if (!u.isActive) continue;
      const list = usersByRole.get(u.role) ?? [];
      list.push(u.id);
      usersByRole.set(u.role, list);
    }

    let breachCount = 0;

    for (const rule of THRESHOLD_RULES) {
      try {
        const data = await getLatestComputedKPIs(rule.boardId, rule.kpiType);
        if (!data) continue;

        const value = getNestedValue(data as unknown as Record<string, unknown>, rule.metricPath);
        if (value === null) continue;

        if (!compare(value, rule.comparator, rule.threshold)) continue;

        // Breach detected — notify each relevant user
        const targetRoles = rule.notifyRoles ?? ["executive", "admin"];
        const recipientIds = new Set<number>();
        for (const role of targetRoles) {
          for (const uid of usersByRole.get(role) ?? []) {
            recipientIds.add(uid);
          }
        }

        const unit = rule.unit ? ` ${rule.unit}` : "";
        const title = `KPI Alert: ${rule.name}`;
        const body  = `${rule.name} is currently ${value.toFixed(1)}${unit}, which is ${comparatorLabel(rule.comparator)} the threshold of ${rule.threshold}${unit}. Immediate review recommended.`;

        for (const userId of Array.from(recipientIds)) {
          await createNotification({
            userId,
            title,
            body,
            severity:  rule.severity,
            actionUrl: rule.actionUrl ?? null,
            source:    "kpi-monitor",
          });
        }

        breachCount++;
        console.log(`[KpiMonitor] Breach: ${rule.name} = ${value} (threshold ${rule.comparator} ${rule.threshold}), notified ${recipientIds.size} user(s)`);
      } catch (ruleErr) {
        console.error(`[KpiMonitor] Error evaluating rule "${rule.name}":`, ruleErr);
      }
    }

    const elapsed = Date.now() - startMs;
    console.log(`[KpiMonitor] Run complete in ${elapsed}ms — ${breachCount} breach(es) detected`);
  } catch (err) {
    console.error("[KpiMonitor] Unexpected error:", err);
  } finally {
    _running = false;
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let _task: ScheduledTask | null = null;

/**
 * Start the KPI threshold monitor.
 * Called once during server startup (see server/_core/index.ts).
 */
export function startKpiMonitor(): void {
  const enabled = process.env.KPI_MONITOR_ENABLED !== "false";
  if (!enabled) {
    console.log("[KpiMonitor] Disabled via KPI_MONITOR_ENABLED=false");
    return;
  }

  const cronExpr = process.env.KPI_MONITOR_CRON ?? "0 */15 * * * *";

  if (!cron.validate(cronExpr)) {
    console.error(`[KpiMonitor] Invalid cron expression: "${cronExpr}" — monitor not started`);
    return;
  }

  _task = cron.schedule(cronExpr, () => {
    runKpiMonitor().catch((err) => console.error("[KpiMonitor] Unhandled error:", err));
  });

  console.log(`[KpiMonitor] Started — schedule: "${cronExpr}"`);
}

/**
 * Stop the KPI threshold monitor (used in tests and graceful shutdown).
 */
export function stopKpiMonitor(): void {
  if (_task) {
    _task.stop();
    _task = null;
    console.log("[KpiMonitor] Stopped");
  }
}

/**
 * Run the monitor immediately (useful for testing or manual triggers).
 */
export { runKpiMonitor };
