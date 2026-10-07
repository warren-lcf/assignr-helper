import { describe, expect, it, vi } from 'vitest';
import { AssignmentResponseAction } from '../enums/assignment_response_action.enum.js';
import { IntegrationProvider } from '../enums/integration_provider.enum.js';
import { ProviderCapability } from '../enums/provider_capability.enum.js';
import { IProviderContext } from '../models/provider_context.model.js';
import { ISyncWindow } from '../models/sync_window.model.js';
import { AssignrHttpClient } from './assignr_http_client.js';
import { AssignrRateBudget } from './assignr_rate_budget.js';
import { AssignrProvider } from './assignr_provider.js';
import { load_fixture } from './fixtures/load_fixture.js';

interface IRecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: URLSearchParams | null;
}

type Responder = (call: IRecordedCall) => unknown;

function make_provider(routes: Record<string, Responder>, on_skipped = vi.fn()) {
  const calls: IRecordedCall[] = [];
  const fetch_impl = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const call: IRecordedCall = {
      method: String(init.method),
      path: url.pathname.replace('/api/v2', ''),
      query: url.searchParams,
      body: (init.body as URLSearchParams | null) ?? null,
    };
    calls.push(call);
    const responder = routes[`${call.method} ${call.path}`];
    if (!responder) return new Response(JSON.stringify({ message: 'no route' }), { status: 404 });
    const result = responder(call);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  });
  let clock = 1_000;
  const http_client = new AssignrHttpClient({
    rate_budget: new AssignrRateBudget({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    }),
    fetch_impl: fetch_impl as unknown as typeof fetch,
  });
  const provider = new AssignrProvider({ http_client, now: () => clock, on_skipped });
  return { provider, calls, on_skipped, advance: (ms: number) => (clock += ms) };
}

const ctx: IProviderContext = {
  tenant_id: 't1',
  connection_id: 'c1',
  get_access_token: async () => 'tok',
};
const window: ISyncWindow = { start_at: Date.UTC(2026, 9, 1), end_at: Date.UTC(2026, 11, 31) };

const standard_routes = (): Record<string, Responder> => ({
  'GET /current_account/sites': () => load_fixture('sites.json'),
  'GET /current_account/users': () => load_fixture('users.json'),
});

describe('AssignrProvider', () => {
  it('declares the supported capabilities and never match report submission', () => {
    const { provider } = make_provider({});

    expect(provider.provider).toBe(IntegrationProvider.ASSIGNR);
    expect(provider.capabilities.has(ProviderCapability.OPEN_GAMES)).toBe(true);
    expect(provider.capabilities.has(ProviderCapability.MATCH_REPORT_SUBMIT)).toBe(false);
  });

  it('lists organizations from active sites', async () => {
    const { provider, calls } = make_provider(standard_routes());

    const organizations = await provider.list_organizations(ctx);

    expect(organizations.map((org) => org.external_id)).toEqual(['101', '202']);
    expect(calls[0].query.get('search[status]')).toBe('active');
  });

  it('skips a malformed site but keeps the rest', async () => {
    const { provider, on_skipped } = make_provider({
      'GET /current_account/sites': () => ({
        _embedded: { sites: [{ id: 1 }, { id: 2, name: 'Good' }] },
        page: { next_page: null },
      }),
    });

    const organizations = await provider.list_organizations(ctx);

    expect(organizations.map((org) => org.name)).toEqual(['Good']);
    expect(on_skipped).toHaveBeenCalledWith('1', expect.anything());
  });

  it('lists my games with a date window and marks them mine', async () => {
    const { provider, calls } = make_provider({
      ...standard_routes(),
      'GET /current_account/games': () => ({
        _embedded: { games: [load_fixture('game_assigned.json')] },
        page: { next_page: null },
      }),
    });

    const result = await provider.list_my_games(ctx, window);

    expect(result.games).toHaveLength(1);
    expect(result.games[0].is_mine).toBe(true);
    expect(result.skipped_count).toBe(0);
    expect(result.complete_organization_external_ids).toBeNull();
    const games_call = calls.find((call) => call.path === '/current_account/games');
    expect(games_call?.query.get('search[start_date]')).toBe('2026-10-01');
    expect(games_call?.query.get('search[end_date]')).toBe('2026-12-31');
  });

  it('lists open games per site, skipping a site that forbids access', async () => {
    const { provider, on_skipped } = make_provider({
      ...standard_routes(),
      'GET /sites/101/games/unassigned': () => load_fixture('games_unassigned.json'),
      'GET /sites/202/games/unassigned': () =>
        new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 }),
    });

    const result = await provider.list_open_games(ctx, window);
    const games = result.games;

    expect(games.map((game) => game.external_id)).toEqual(['6001', '6002']);
    expect(games[0].organization_external_id).toBe('101');
    expect(games[0].is_open).toBe(true);
    expect(games[1].is_open).toBe(false);
    expect(on_skipped).toHaveBeenCalledWith('202', expect.anything());
    expect(result.skipped_count).toBe(1);
    expect(result.complete_organization_external_ids).toEqual(['101']);
  });

  it('rethrows non-access failures while listing open games', async () => {
    const { provider } = make_provider({
      ...standard_routes(),
      'GET /sites/101/games/unassigned': () => new Response('{}', { status: 500 }),
    });

    await expect(provider.list_open_games(ctx, window)).rejects.toThrow(/500/);
  });

  it('fetches one game live', async () => {
    const { provider } = make_provider({
      ...standard_routes(),
      'GET /games/5001': () => load_fixture('game_assigned.json'),
    });

    const game = await provider.get_game(ctx, '5001');

    expect(game.external_id).toBe('5001');
    expect(game.is_mine).toBe(true);
  });

  it('caches my user ids between calls and refreshes them after the TTL', async () => {
    const { provider, calls, advance } = make_provider({
      ...standard_routes(),
      'GET /games/5001': () => load_fixture('game_assigned.json'),
    });

    await provider.get_game(ctx, '5001');
    await provider.get_game(ctx, '5001');
    expect(calls.filter((call) => call.path === '/current_account/users')).toHaveLength(1);

    advance(11 * 60_000);
    await provider.get_game(ctx, '5001');
    expect(calls.filter((call) => call.path === '/current_account/users')).toHaveLength(2);
  });

  it('accepts an assignment then re-reads the game', async () => {
    const { provider, calls } = make_provider({
      ...standard_routes(),
      'POST /assignments/8001/confirm': () => ({}),
      'GET /games/5001': () => load_fixture('game_assigned.json'),
    });

    const game = await provider.respond_to_assignment(ctx, {
      game_external_id: '5001',
      assignment_external_id: '8001',
      action: AssignmentResponseAction.ACCEPT,
      reason: 'ignored when accepting',
      lock_version: 1,
    });

    expect(game.external_id).toBe('5001');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body?.get('status')).toBe('A');
    expect(post?.body?.has('reason')).toBe(false);
  });

  it('declines with a reason', async () => {
    const { provider, calls } = make_provider({
      ...standard_routes(),
      'POST /assignments/8001/confirm': () => ({}),
      'GET /games/5001': () => load_fixture('game_assigned.json'),
    });

    await provider.respond_to_assignment(ctx, {
      game_external_id: '5001',
      assignment_external_id: '8001',
      action: AssignmentResponseAction.DECLINE,
      reason: 'Conflict',
      lock_version: null,
    });

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body?.get('status')).toBe('D');
    expect(post?.body?.get('reason')).toBe('Conflict');
  });

  it('requests a game with and without a position', async () => {
    const { provider, calls } = make_provider({
      ...standard_routes(),
      'POST /game_requests': () => ({}),
      'GET /games/6001': () =>
        (
          load_fixture('games_unassigned.json') as {
            _embedded: { games: unknown[] };
          }
        )._embedded.games[0],
    });

    await provider.request_game(ctx, { game_external_id: '6001', position_external_id: '1' });
    await provider.request_game(ctx, { game_external_id: '6001', position_external_id: null });

    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts[0].body?.get('game_id')).toBe('6001');
    expect(posts[0].body?.get('position_id')).toBe('1');
    expect(posts[1].body?.has('position_id')).toBe(false);
  });

  it('uses the default skip logger when none is supplied', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const http_client = new AssignrHttpClient({
      rate_budget: new AssignrRateBudget({ now: () => 1, sleep: async () => undefined }),
      fetch_impl: (async () =>
        new Response(
          JSON.stringify({ _embedded: { sites: [{ id: 1 }] }, page: { next_page: null } }),
        )) as unknown as typeof fetch,
    });

    await new AssignrProvider({ http_client }).list_organizations(ctx);

    expect(error_spy).toHaveBeenCalled();
    error_spy.mockRestore();
  });
});
