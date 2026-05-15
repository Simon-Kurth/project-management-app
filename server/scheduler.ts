/**
 * Background scheduler for the Azure Boards data pipeline.
 *
 * Runs on a configurable cron interval (default: every 30 minutes).
 * All heavy lifting is done by AzureBoardsConnector.computeAllKPIs() which
 * returns pre-aggregated KPI objects — nothing raw is stored or sent anywhere.
 *
 * To disable: set AZURE_SYNC_ENABLED=false in environment.
 */

import { AzureBoardsConnector } from "./connectors/azureBoards";
import { upsertComputedKPIs, getLatestComputedKPIs } from "./db";

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

/**
 * Run a single Azure Boards sync cycle.
 * Safe to call manually (e.g., from an admin tRPC mutation to force refresh).
 */
export async function runAzureSync(): Promise<{ success: boolean; message: string }> {
  if (isSyncing) {
    return { success: false, message: "Sync already in progress" };
  }

  const connector = new AzureBoardsConnector();

  if (!connector.isConfigured()) {
    return {
      success: false,
      message:
        "Azure Boards not configured. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT.",
    };
  }

  isSyncing = true;
  const startedAt = Date.now();

  try {
    console.log("[Azure Sync] Starting KPI computation...");

    const kpis = await connector.computeAllKPIs();

    await upsertComputedKPIs({
      boardId: kpis.boardId,
      kpiType: "delivery",
      data: kpis,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[Azure Sync] Complete in ${elapsed}s — velocity: ${kpis.velocity.length} sprints, bugs: ${kpis.bugs.openTotal} open`
    );

    return { success: true, message: `Sync complete in ${elapsed}s` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Azure Sync] Failed:", msg);
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
  if (process.env.AZURE_SYNC_ENABLED === "false") {
    console.log("[Scheduler] Azure Boards sync disabled (AZURE_SYNC_ENABLED=false)");
    return;
  }

  const intervalMinutes = parseInt(
    process.env.AZURE_SYNC_INTERVAL_MINUTES ?? "30",
    10
  );
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Scheduler] Azure Boards sync scheduled every ${intervalMinutes} minutes`);

  // Run once at startup (after a short delay to let DB connections settle)
  setTimeout(() => {
    runAzureSync().catch(console.error);
  }, 5000);

  // Then on the configured interval
  syncTimer = setInterval(() => {
    runAzureSync().catch(console.error);
  }, intervalMs);
}

export function stopScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[Scheduler] Stopped");
  }
}
