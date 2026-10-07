import { describe, expect, it } from 'vitest';
import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { derive_connection_outcome } from './derive_connection_outcome.js';
import { ISyncRun } from './models/sync_run.model.js';

function run(
  status: SyncRunStatus,
  error: { name: string; message: string } | null = null,
): ISyncRun {
  return {
    tenant_id: 't',
    run_id: 'r',
    connection_id: 'c',
    kind: SyncKind.OPEN_GAMES,
    window_start: 0,
    window_end: 1,
    status,
    started_at: 1,
    finished_at: 2,
    seen_count: 0,
    created_count: 0,
    updated_count: 0,
    removed_count: 0,
    rate_limit_remaining: null,
    duration_ms: 1,
    error: error ? { ...error, status: null } : null,
    created_at: 1,
    created_by: 'a',
    updated_at: 2,
    updated_by: 'a',
  };
}

describe('derive_connection_outcome', () => {
  it('stamps a clean success and clears the last error', () => {
    expect(
      derive_connection_outcome([run(SyncRunStatus.SUCCEEDED), run(SyncRunStatus.SUCCEEDED)], 5000),
    ).toEqual({ last_sync_at: 5000, last_error: null, status: null });
  });

  it('treats skipped runs as neutral next to a success', () => {
    expect(
      derive_connection_outcome([run(SyncRunStatus.SKIPPED), run(SyncRunStatus.SUCCEEDED)], 7),
    ).toEqual({ last_sync_at: 7, last_error: null, status: null });
  });

  it('changes nothing when every run was skipped, or there were none', () => {
    expect(derive_connection_outcome([run(SyncRunStatus.SKIPPED)], 1)).toBeNull();
    expect(derive_connection_outcome([], 1)).toBeNull();
  });

  it.each(['AssignrAuthError', 'ConnectionNotAuthorizedError'])(
    'flags the connection when a run failed with %s',
    (name) => {
      const outcome = derive_connection_outcome(
        [
          run(SyncRunStatus.SUCCEEDED),
          run(SyncRunStatus.FAILED, { name, message: 'reconnect please' }),
        ],
        9,
      );

      expect(outcome).toEqual({
        last_sync_at: null,
        last_error: 'reconnect please',
        status: ConnectionStatus.NEEDS_ATTENTION,
      });
    },
  );

  it('records any other failure without taking the connection out of service', () => {
    const outcome = derive_connection_outcome(
      [run(SyncRunStatus.FAILED, { name: 'AssignrApiError', message: 'Assignr API 500' })],
      9,
    );

    expect(outcome).toEqual({ last_sync_at: null, last_error: 'Assignr API 500', status: null });
  });

  it('prefers the credentials failure when failures are mixed', () => {
    const outcome = derive_connection_outcome(
      [
        run(SyncRunStatus.FAILED, { name: 'AssignrApiError', message: 'server error' }),
        run(SyncRunStatus.FAILED, { name: 'AssignrAuthError', message: 'token rejected' }),
      ],
      9,
    );

    expect(outcome?.status).toBe(ConnectionStatus.NEEDS_ATTENTION);
    expect(outcome?.last_error).toBe('token rejected');
  });

  it('handles a failed run recorded without an error object', () => {
    expect(derive_connection_outcome([run(SyncRunStatus.FAILED)], 3)).toEqual({
      last_sync_at: null,
      last_error: null,
      status: null,
    });
  });
});
