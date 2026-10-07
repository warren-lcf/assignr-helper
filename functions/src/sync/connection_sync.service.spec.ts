import { describe, expect, it, vi } from 'vitest';
import type { IConnection } from '../connections/models/connection.model.js';
import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { ConnectionNotFoundError } from '../connections/errors/connection_not_found.error.js';
import { ConnectionNotSyncableError } from '../connections/errors/connection_not_syncable.error.js';
import { InMemoryConnectionStore } from '../connections/stores/in_memory_connection_store.js';
import { AssignrAuthError } from '../integrations/assignr/errors/assignr_auth_error.js';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { ConnectionSyncService } from './connection_sync.service.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { make_connection } from './make_connection.fixture.js';
import { make_normalized_game } from './make_normalized_game.fixture.js';
import { make_sync_harness } from './make_sync_harness.fixture.js';

function make_service() {
  const harness = make_sync_harness();
  const connections = new InMemoryConnectionStore();
  const sessions = {
    create_session: vi.fn((_connection: IConnection) => ({
      provider: harness.provider,
      ctx: harness.deps.ctx,
      rate_limit_remaining: () => 77,
    })),
  };
  const service = new ConnectionSyncService({
    connections,
    sessions,
    stores: {
      games: harness.games,
      organizations: harness.organizations,
      venues: harness.venues,
      runs: harness.runs,
    },
    now: harness.deps.now,
    generate_id: harness.deps.generate_id,
  });
  harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];
  return { service, harness, connections, sessions };
}

describe('ConnectionSyncService.sync_one', () => {
  it('syncs the connection, stores the games and stamps the connection as synced', async () => {
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection());
    harness.provider.open_result = {
      games: [make_normalized_game()],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    const runs = await service.sync_one('t1', 'c1', 'user-1');

    expect(runs.map((run) => run.kind)).toEqual([
      SyncKind.REFERENCE_DATA,
      SyncKind.OPEN_GAMES,
      SyncKind.MY_GAMES,
    ]);
    expect(runs.every((run) => run.status === SyncRunStatus.SUCCEEDED)).toBe(true);
    expect(harness.games.all_games()).toHaveLength(1);
    const updated = await connections.get_connection('t1', 'c1');
    expect(updated?.last_sync_at).not.toBeNull();
    expect(updated?.last_error).toBeNull();
    expect(updated?.updated_by).toBe('user-1');
  });

  it('passes the refresh request through to the reference data sync', async () => {
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection());
    await service.sync_one('t1', 'c1', 'user-1');
    harness.provider.calls.length = 0;

    await service.sync_one('t1', 'c1', 'user-1', true);

    expect(harness.provider.calls).toContain('list_organizations');
  });

  it('throws not-found for a missing connection and for another tenant', async () => {
    const { service, connections } = make_service();
    await connections.save_connection(make_connection({ tenant_id: 'other-tenant' }));

    await expect(service.sync_one('t1', 'c1', 'u')).rejects.toBeInstanceOf(ConnectionNotFoundError);
    await expect(service.sync_one('t1', 'nope', 'u')).rejects.toBeInstanceOf(
      ConnectionNotFoundError,
    );
  });

  it('refuses a connection that is not CONNECTED, without touching the provider', async () => {
    const { service, harness, connections, sessions } = make_service();
    await connections.save_connection(
      make_connection({ status: ConnectionStatus.NEEDS_ATTENTION }),
    );

    await expect(service.sync_one('t1', 'c1', 'u')).rejects.toBeInstanceOf(
      ConnectionNotSyncableError,
    );
    expect(sessions.create_session).not.toHaveBeenCalled();
    expect(harness.provider.calls).toEqual([]);
  });

  it('flags the connection when the provider rejects its credentials, and then stops syncing it', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection());
    harness.provider.failure = new AssignrAuthError('token rejected', {});

    const runs = await service.sync_one('t1', 'c1', 'u');

    expect(runs.every((run) => run.status === SyncRunStatus.FAILED)).toBe(true);
    const flagged = await connections.get_connection('t1', 'c1');
    expect(flagged).toMatchObject({
      status: ConnectionStatus.NEEDS_ATTENTION,
      last_error: 'token rejected',
    });
    await expect(service.sync_one('t1', 'c1', 'u')).rejects.toBeInstanceOf(
      ConnectionNotSyncableError,
    );
    error_spy.mockRestore();
  });

  it('records another failure but keeps the connection usable and the last good sync', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection({ last_sync_at: 4242 }));
    harness.provider.failure = new AssignrApiError('Assignr API 500', 500, {});

    await service.sync_one('t1', 'c1', 'u');

    expect(await connections.get_connection('t1', 'c1')).toMatchObject({
      status: ConnectionStatus.CONNECTED,
      last_error: 'Assignr API 500',
      last_sync_at: 4242,
    });
    error_spy.mockRestore();
  });

  it('leaves the connection alone when every run was skipped', async () => {
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection({ last_error: 'earlier problem' }));
    await service.sync_one('t1', 'c1', 'u');
    const baseline = await connections.get_connection('t1', 'c1');
    // Mark one run of each kind as in progress so the next attempt skips them all.
    const [first] = await harness.runs.list_runs('t1', 'c1', 1);
    for (const kind of [SyncKind.REFERENCE_DATA, SyncKind.OPEN_GAMES, SyncKind.MY_GAMES]) {
      await harness.runs.save_run({
        ...first,
        run_id: `busy-${kind}`,
        kind,
        status: SyncRunStatus.RUNNING,
        started_at: harness.clock(),
        finished_at: null,
      });
    }

    const runs = await service.sync_one('t1', 'c1', 'u', true);

    expect(runs.every((run) => run.status === SyncRunStatus.SKIPPED)).toBe(true);
    expect(await connections.get_connection('t1', 'c1')).toEqual(baseline);
  });
});

describe('ConnectionSyncService.sync_all', () => {
  it('syncs eligible connections, never-synced first, and skips ones that are not CONNECTED', async () => {
    const { service, connections, sessions } = make_service();
    await connections.save_connection(make_connection({ connection_id: 'old', last_sync_at: 100 }));
    await connections.save_connection(
      make_connection({ connection_id: 'never', last_sync_at: null }),
    );
    await connections.save_connection(
      make_connection({ connection_id: 'broken', status: ConnectionStatus.NEEDS_ATTENTION }),
    );

    const summary = await service.sync_all('system:scheduler', 10, 60_000);

    expect(summary).toEqual({ attempted: 2, succeeded: 2, failed: 0, deferred: 0 });
    expect(sessions.create_session.mock.calls.map((call) => call[0].connection_id)).toEqual([
      'never',
      'old',
    ]);
  });

  it('counts a connection whose run failed, and carries on with the rest', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, harness, connections } = make_service();
    await connections.save_connection(make_connection({ connection_id: 'a' }));
    await connections.save_connection(make_connection({ connection_id: 'b', last_sync_at: 1 }));
    harness.provider.failure = new AssignrApiError('Assignr API 500', 500, {});

    const summary = await service.sync_all('system:scheduler', 10, 60_000);

    expect(summary).toEqual({ attempted: 2, succeeded: 0, failed: 2, deferred: 0 });
    error_spy.mockRestore();
  });

  it('counts an attempt that throws before any run, and logs the real error', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, connections, sessions } = make_service();
    await connections.save_connection(make_connection());
    sessions.create_session.mockImplementationOnce(() => {
      throw new Error('unsupported provider');
    });

    const summary = await service.sync_all('system:scheduler', 10, 60_000);

    expect(summary).toEqual({ attempted: 1, succeeded: 0, failed: 1, deferred: 0 });
    expect(error_spy).toHaveBeenCalledWith(
      'Scheduled sync failed for connection',
      'c1',
      expect.any(Error),
    );
    error_spy.mockRestore();
  });

  it('defers the rest once the time budget is spent', async () => {
    const { harness, connections } = make_service();
    for (const id of ['a', 'b', 'c']) {
      await connections.save_connection(make_connection({ connection_id: id }));
    }
    // A controllable clock where every connection takes 60 s.
    let clock = 0;
    const slow_service = new ConnectionSyncService({
      connections,
      sessions: {
        create_session: () => {
          clock += 60_000;
          return {
            provider: harness.provider,
            ctx: harness.deps.ctx,
            rate_limit_remaining: () => null,
          };
        },
      },
      stores: {
        games: harness.games,
        organizations: harness.organizations,
        venues: harness.venues,
        runs: harness.runs,
      },
      now: () => clock,
      generate_id: harness.deps.generate_id,
    });

    const summary = await slow_service.sync_all('system:scheduler', 10, 100_000);

    expect(summary).toEqual({ attempted: 2, succeeded: 2, failed: 0, deferred: 1 });
  });

  it('does nothing when no connection is eligible', async () => {
    const { service } = make_service();

    expect(await service.sync_all('system:scheduler', 10, 60_000)).toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      deferred: 0,
    });
  });
});
