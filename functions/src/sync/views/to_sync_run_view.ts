import { ISyncRun } from '../models/sync_run.model.js';
import { ISyncRunView } from './sync_run_view.model.js';

/**
 * Projects a stored run to its API shape.
 * @param run Stored run.
 * @returns The run without tenant id or audit stamps.
 */
export function to_sync_run_view(run: ISyncRun): ISyncRunView {
  return {
    run_id: run.run_id,
    connection_id: run.connection_id,
    kind: run.kind,
    status: run.status,
    window_start: run.window_start,
    window_end: run.window_end,
    started_at: run.started_at,
    finished_at: run.finished_at,
    duration_ms: run.duration_ms,
    seen_count: run.seen_count,
    created_count: run.created_count,
    updated_count: run.updated_count,
    removed_count: run.removed_count,
    error: run.error,
  };
}
