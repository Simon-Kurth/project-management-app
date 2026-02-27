/**
 * Background scheduler for the Jira data pipeline.
 *
 * Runs on a configurable cron interval (default: every 30 minutes).
 * All heavy lifting is done by JiraConnector.computeAllKPIs() which
 * returns pre-aggregated KPI objects — nothing raw is stored or sent anywhere.
 *
 * To disable: set JIRA_SYNC_ENABLED=false in environment.
 */

import { JiraConnector } from "./connectors/jira";
import { upsertComputedKPIs, getLatestComputedKPIs } from "./db";

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

/**
 * Run a single Jira sync cycle.
 * Safe to call manually (e.g., from an admin tRPC mutation to force refresh).
 */
export async function runJiraSync(): Promise<{ success: boolean; message: string }> {
  if (isSyncing) {
    return { success: false, message: "Sync already in progress" };
  }

  const connector = new JiraConnector();

  if (!connector.isConfigured()) {
    return {
      success: false,
      message:
        "Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BOARD_ID, JIRA_PROJECT_KEY.",
    };
  }

  isSyncing = true;
  const startedAt = Date.now();

  try {
    console.log("[Jira Sync] Starting KPI computation...");

    // All aggregation happens inside computeAllKPIs() — pure local computation
    const kpis = await connector.computeAllKPIs();

    // Persist only the final computed KPI object (not raw issues)
    await upsertComputedKPIs({
      boardId: kpis.boardId,
      kpiType: "delivery",
      data: kpis,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[Jira Sync] Complete in ${elapsed}s — velocity: ${kpis.velocity.length} sprints, bugs: ${kpis.bugs.openTotal} open`);

    return {
      success: true,
      message: `Sync complete in ${elapsed}s`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Jira Sync] Failed:", msg);
    return { success: false, message: msg };
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the background scheduler.
 * Called once at server startup from server/_core/index.ts.
 */
export function startScheduler(): void {
  if (process.env.JIRA_SYNC_ENABLED === "false") {
    console.log("[Scheduler] Jira sync disabled (JIRA_SYNC_ENABLED=false)");
    return;
  }

  const intervalMinutes = parseInt(process.env.JIRA_SYNC_INTERVAL_MINUTES ?? "30", 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Scheduler] Jira sync scheduled every ${intervalMinutes} minutes`);

  // Run once at startup (after a short delay to let DB connections settle)
  setTimeout(() => {
    runJiraSync().catch(console.error);
  }, 5000);

  // Then on the configured interval
  syncTimer = setInterval(() => {
    runJiraSync().catch(console.error);
  }, intervalMs);
}

export function stopScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[Scheduler] Stopped");
  }
}
