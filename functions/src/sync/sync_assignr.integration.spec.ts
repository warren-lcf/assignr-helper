import { describe, expect, it, vi } from 'vitest';
import { AssignrHttpClient } from '../integrations/assignr/assignr_http_client.js';
import { AssignrProvider } from '../integrations/assignr/assignr_provider.js';
import { AssignrRateBudget } from '../integrations/assignr/assignr_rate_budget.js';
import { load_fixture } from '../integrations/assignr/fixtures/load_fixture.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { ISyncDeps } from './models/sync_deps.model.js';
import { InMemoryGameStore } from './stores/in_memory_game_store.js';
import { InMemoryOrganizationStore } from './stores/in_memory_organization_store.js';
import { InMemorySyncRunStore } from './stores/in_memory_sync_run_store.js';
import { InMemoryVenueStore } from './stores/in_memory_venue_store.js';
import { sync_connection } from './sync_connection.js';

/** Wires the real Assignr adapter, through a fake `fetch`, into the engine and in-memory stores. */
function make_wired_engine() {
  const games_fixture = load_fixture('games_unassigned.json') as {
    _embedded: { games: unknown[] };
    page: unknown;
  };
  const state = {
    open_games_101: games_fixture,
    site_202_status: 403,
  };
  const routes: Record<string, () => Response> = {
    '/current_account/sites': () => Response.json(load_fixture('sites.json')),
    '/current_account/users': () => Response.json(load_fixture('users.json')),
    '/sites/101/games/unassigned': () => Response.json(state.open_games_101),
    '/sites/202/games/unassigned': () => new Response('{}', { status: state.site_202_status }),
    '/current_account/games': () =>
      Response.json({
        _embedded: { games: [load_fixture('game_assigned.json')] },
        page: { next_page: null },
      }),
  };
  const fetch_impl = vi.fn(async (input: string) => {
    const path = new URL(input).pathname.replace('/api/v2', '');
    const route = routes[path];
    return route ? route() : new Response('{}', { status: 404 });
  });

  let clock = Date.UTC(2026, 9, 7);
  let counter = 0;
  const generate_id = (): string => `id-${++counter}`;
  const rate_budget = new AssignrRateBudget({
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  const provider = new AssignrProvider({
    http_client: new AssignrHttpClient({
      rate_budget,
      fetch_impl: fetch_impl as unknown as typeof fetch,
    }),
    now: () => clock,
    on_skipped: () => undefined,
  });
  const games = new InMemoryGameStore();
  const deps: ISyncDeps = {
    provider,
    ctx: { tenant_id: 't1', connection_id: 'c1', get_access_token: async () => 'token' },
    games,
    organizations: new InMemoryOrganizationStore({ generate_id }),
    venues: new InMemoryVenueStore({ generate_id }),
    runs: new InMemorySyncRunStore(),
    now: () => (clock += 1000),
    generate_id,
    rate_limit_remaining: () => rate_budget.last_remaining,
  };
  return { deps, games, state };
}

describe('sync with the Assignr adapter', () => {
  it('syncs organizations, open games and my games from documented-shape payloads', async () => {
    const { deps, games } = make_wired_engine();

    const runs = await sync_connection(deps, { tenant_id: 't1', connection_id: 'c1', actor: 'u1' });

    expect(runs.map((run) => [run.kind, run.status])).toEqual([
      [SyncKind.REFERENCE_DATA, SyncRunStatus.SUCCEEDED],
      [SyncKind.OPEN_GAMES, SyncRunStatus.SUCCEEDED],
      [SyncKind.MY_GAMES, SyncRunStatus.SUCCEEDED],
    ]);
    const by_external_id = new Map(games.all_games().map((game) => [game.external_id, game]));
    expect([...by_external_id.keys()].sort()).toEqual(['5001', '6001', '6002']);
    expect(by_external_id.get('6001')).toMatchObject({ is_open: true, is_mine: false });
    expect(by_external_id.get('6002')?.removed_at).not.toBeNull();
    expect(by_external_id.get('5001')).toMatchObject({ is_mine: true });
    expect(by_external_id.get('5001')?.local_date).toBe(Date.UTC(2026, 9, 11));
  });

  it('is idempotent on a second sync and removes a game that leaves the open list', async () => {
    const { deps, games, state } = make_wired_engine();
    await sync_connection(deps, { tenant_id: 't1', connection_id: 'c1', actor: 'u1' });

    const repeat = await sync_connection(deps, {
      tenant_id: 't1',
      connection_id: 'c1',
      actor: 'u1',
    });
    expect(repeat.every((run) => run.created_count === 0 && run.updated_count === 0)).toBe(true);

    state.open_games_101 = { _embedded: { games: [] }, page: { next_page: null } } as never;
    const after = await sync_connection(deps, {
      tenant_id: 't1',
      connection_id: 'c1',
      actor: 'u1',
    });

    const open_run = after.find((run) => run.kind === SyncKind.OPEN_GAMES);
    expect(open_run?.removed_count).toBe(1);
    const taken = games.all_games().find((game) => game.external_id === '6001');
    expect(taken).toMatchObject({ is_open: false });
    expect(taken?.removed_at).not.toBeNull();
  });
});
