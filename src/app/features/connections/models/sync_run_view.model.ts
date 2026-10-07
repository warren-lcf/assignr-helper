import { SyncKind } from '../enums/sync_kind.enum';
import { SyncRunStatus } from '../enums/sync_run_status.enum';
import { ISyncRunError } from './sync_run_error.model';

/** One sync run, as `GET /api/connections/:id/sync-runs` returns it. Times are UTC milliseconds. */
export interface ISyncRunView {
  /** Run id. */
  run_id: string;
  /** Connection the run belongs to. */
  connection_id: string;
  /** What the run pulled. */
  kind: SyncKind;
  /** Outcome. */
  status: SyncRunStatus;
  /** Start of the date window the run covered, if it had one. */
  window_start: number | null;
  /** End of the date window the run covered, if it had one. */
  window_end: number | null;
  /** When the run started. */
  started_at: number;
  /** When the run finished, or null while running. */
  finished_at: number | null;
  /** How long the run took, or null while running. */
  duration_ms: number | null;
  /** Records the provider returned. */
  seen_count: number;
  /** Records added to our copy. */
  created_count: number;
  /** Records changed in our copy. */
  updated_count: number;
  /** Records removed from our copy. */
  removed_count: number;
  /** The recorded error when the run failed. */
  error: ISyncRunError | null;
}
