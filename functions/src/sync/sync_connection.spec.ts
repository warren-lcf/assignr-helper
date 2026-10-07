import { describe, expect, it } from 'vitest';
import { ProviderCapability } from '../integrations/enums/provider_capability.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { make_sync_harness } from './make_sync_harness.fixture.js';
import { sync_connection } from './sync_connection.js';

const request = { tenant_id: 't1', connection_id: 'c1', actor: 'user-1' };

describe('sync_connection', () => {
  it('runs reference data, open games, then my games the first time', async () => {
    const harness = make_sync_harness();
    harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];

    const runs = await sync_connection(harness.deps, request);

    expect(runs.map((run) => run.kind)).toEqual([
      SyncKind.REFERENCE_DATA,
      SyncKind.OPEN_GAMES,
      SyncKind.MY_GAMES,
    ]);
    expect(runs.every((run) => run.status === SyncRunStatus.SUCCEEDED)).toBe(true);
    expect(runs.every((run) => run.created_by === 'user-1')).toBe(true);
  });

  it('skips reference data once organizations are stored', async () => {
    const harness = make_sync_harness();
    harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];
    await sync_connection(harness.deps, request);

    const runs = await sync_connection(harness.deps, request);

    expect(runs.map((run) => run.kind)).toEqual([SyncKind.OPEN_GAMES, SyncKind.MY_GAMES]);
  });

  it('refreshes reference data on demand', async () => {
    const harness = make_sync_harness();
    harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];
    await sync_connection(harness.deps, request);

    const runs = await sync_connection(harness.deps, { ...request, refresh_reference_data: true });

    expect(runs.map((run) => run.kind)).toContain(SyncKind.REFERENCE_DATA);
  });

  it('skips open games when the provider does not support them', async () => {
    const harness = make_sync_harness();
    harness.provider.capabilities = new Set<ProviderCapability>();
    harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];

    const runs = await sync_connection(harness.deps, request);

    expect(runs.map((run) => run.kind)).toEqual([SyncKind.REFERENCE_DATA, SyncKind.MY_GAMES]);
  });

  it('plans the window from the current time and uses it for game runs', async () => {
    const harness = make_sync_harness();
    harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];

    const runs = await sync_connection(harness.deps, request);

    const game_run = runs.find((run) => run.kind === SyncKind.OPEN_GAMES);
    expect(game_run?.window_start).not.toBeNull();
    expect((game_run?.window_end ?? 0) > (game_run?.window_start ?? 0)).toBe(true);
  });

  it('keeps going after one run fails', async () => {
    const harness = make_sync_harness();
    harness.provider.failure = new Error('provider down');
    const error_log = console.error;
    console.error = () => undefined;

    const runs = await sync_connection(harness.deps, request);
    console.error = error_log;

    expect(runs).toHaveLength(3);
    expect(runs.every((run) => run.status === SyncRunStatus.FAILED)).toBe(true);
  });
});
