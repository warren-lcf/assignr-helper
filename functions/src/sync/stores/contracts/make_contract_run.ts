import { SyncKind } from '../../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../../enums/sync_run_status.enum.js';
import { ISyncRun } from '../../models/sync_run.model.js';

/**
 * Builds a running sync run for contract tests.
 * @param tenant_id Owning tenant.
 * @param run_id Primary key of the run.
 * @param overrides Fields to replace.
 * @returns A complete run.
 */
export function make_contract_run(
  tenant_id: string,
  run_id: string,
  overrides: Partial<ISyncRun> = {},
): ISyncRun {
  return {
    tenant_id,
    run_id,
    connection_id: 'c1',
    kind: SyncKind.OPEN_GAMES,
    window_start: null,
    window_end: null,
    status: SyncRunStatus.RUNNING,
    started_at: 1000,
    finished_at: null,
    seen_count: 0,
    created_count: 0,
    updated_count: 0,
    removed_count: 0,
    rate_limit_remaining: null,
    duration_ms: null,
    error: null,
    created_at: 1000,
    created_by: 'a',
    updated_at: 1000,
    updated_by: 'a',
    ...overrides,
  };
}
