import { SyncKind } from '../enums/sync_kind.enum';
import { SyncRunStatus } from '../enums/sync_run_status.enum';
import { ISyncRunView } from '../models/sync_run_view.model';

/**
 * Builds a sync run fixture.
 * @param overrides Fields to change from a clean open-games run.
 * @returns The run.
 */
export function make_sync_run_view(overrides: Partial<ISyncRunView> = {}): ISyncRunView {
  return {
    run_id: 'run-1',
    connection_id: 'conn-1',
    kind: SyncKind.OPEN_GAMES,
    status: SyncRunStatus.SUCCEEDED,
    window_start: 1_786_147_200_000,
    window_end: 1_788_739_200_000,
    started_at: 1_786_234_975_000,
    finished_at: 1_786_234_976_200,
    duration_ms: 1200,
    seen_count: 1234,
    created_count: 12,
    updated_count: 3,
    removed_count: 1,
    error: null,
    ...overrides,
  };
}

/** A clean run. */
export const SUCCEEDED_RUN: ISyncRunView = make_sync_run_view();

/** A run that stopped with an error. */
export const FAILED_RUN: ISyncRunView = make_sync_run_view({
  run_id: 'run-2',
  kind: SyncKind.MY_GAMES,
  status: SyncRunStatus.FAILED,
  seen_count: 0,
  created_count: 0,
  updated_count: 0,
  removed_count: 0,
  error: { name: 'AssignrApiError', message: 'Bad gateway', status: 502 },
});

/** A run that was not attempted. */
export const SKIPPED_RUN: ISyncRunView = make_sync_run_view({
  run_id: 'run-3',
  kind: SyncKind.REFERENCE_DATA,
  status: SyncRunStatus.SKIPPED,
  duration_ms: 0,
  seen_count: 0,
  created_count: 0,
  updated_count: 0,
  removed_count: 0,
});

/** A run still in progress. */
export const RUNNING_RUN: ISyncRunView = make_sync_run_view({
  run_id: 'run-4',
  status: SyncRunStatus.RUNNING,
  finished_at: null,
  duration_ms: null,
});

/** Runs in each status, newest first. */
export const SYNC_RUN_FIXTURES: readonly ISyncRunView[] = [
  SUCCEEDED_RUN,
  FAILED_RUN,
  SKIPPED_RUN,
  RUNNING_RUN,
];
