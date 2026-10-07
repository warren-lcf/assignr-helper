import { SyncKind } from '../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../enums/sync_run_status.enum.js';
import { IAuditStamp } from './audit_stamp.model.js';
import { ISyncRunError } from './sync_run_error.model.js';

/** One execution of a sync, shown in the sync history. */
export interface ISyncRun extends IAuditStamp {
  tenant_id: string;
  run_id: string;
  connection_id: string;
  kind: SyncKind;
  window_start: number | null;
  window_end: number | null;
  status: SyncRunStatus;
  started_at: number;
  finished_at: number | null;
  seen_count: number;
  created_count: number;
  updated_count: number;
  removed_count: number;
  rate_limit_remaining: number | null;
  duration_ms: number | null;
  error: ISyncRunError | null;
}
