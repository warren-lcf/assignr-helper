import { SyncOutcome } from '../enums/sync_outcome.enum';
import { SyncRunStatus } from '../enums/sync_run_status.enum';
import { ISyncRunView } from '../models/sync_run_view.model';

/**
 * Judges a "Sync now" call from the runs it returned. Skipped steps count as
 * neither a success nor a failure.
 * @param runs The runs the sync returned.
 * @returns SUCCESS when nothing failed, PARTIAL when some steps failed and some succeeded, FAILED when every step that ran failed.
 */
export function classify_sync_runs(runs: readonly ISyncRunView[]): SyncOutcome {
  const failed = runs.filter((run) => run.status === SyncRunStatus.FAILED).length;
  if (failed === 0) return SyncOutcome.SUCCESS;
  const succeeded = runs.filter((run) => run.status === SyncRunStatus.SUCCEEDED).length;
  return succeeded > 0 ? SyncOutcome.PARTIAL : SyncOutcome.FAILED;
}
