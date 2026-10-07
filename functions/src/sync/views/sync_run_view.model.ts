import { SyncKind } from '../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../enums/sync_run_status.enum.js';
import { ISyncRunError } from '../models/sync_run_error.model.js';

/** A sync run as the API returns it: no tenant id and no audit stamps. */
export interface ISyncRunView {
  run_id: string;
  connection_id: string;
  kind: SyncKind;
  status: SyncRunStatus;
  window_start: number | null;
  window_end: number | null;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  seen_count: number;
  created_count: number;
  updated_count: number;
  removed_count: number;
  error: ISyncRunError | null;
}
