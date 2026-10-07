import { ConnectionSyncService } from './connection_sync.service.js';
import { IScheduledSyncSummary } from './models/scheduled_sync_summary.model.js';

/** Actor stamped on everything the scheduler writes. */
export const SCHEDULED_SYNC_ACTOR = 'system:scheduler';

/** Most connections one scheduled pass considers. */
export const SCHEDULED_SYNC_CONNECTION_LIMIT = 200;

/**
 * Time after which a pass stops starting new connections. The function times out
 * at 540 s, so this leaves room for the connection already in progress.
 */
export const SCHEDULED_SYNC_BUDGET_MS = 7 * 60_000;

/**
 * The body of the scheduled function: syncs every eligible connection and logs a
 * one-line summary for Cloud Logging.
 * @param service The connection sync service.
 * @returns What the pass did.
 */
export async function run_scheduled_sync(
  service: ConnectionSyncService,
): Promise<IScheduledSyncSummary> {
  const summary = await service.sync_all(
    SCHEDULED_SYNC_ACTOR,
    SCHEDULED_SYNC_CONNECTION_LIMIT,
    SCHEDULED_SYNC_BUDGET_MS,
  );
  console.log('Scheduled sync finished', JSON.stringify(summary));
  return summary;
}
