import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { generate_quick_link_token } from '../domain/quick_links/generate_quick_link_token.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { TokenBucketRateLimiter } from '../http/rate_limit/token_bucket_rate_limiter.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IRoutesApp, IRoutesAppOptions, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { IStoredQuickLink } from './models/stored_quick_link.model.js';
import { make_contract_quick_link } from './stores/contracts/make_contract_quick_link.js';

const HOUR = 3_600_000;
const NOT_AVAILABLE = { code: 'NOT_FOUND', message: 'This link is not available' };
const PUBLIC_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};
const RESPONSE_KEYS = ['as_of', 'leagues', 'levels', 'location_groups', 'locations', 'total'];
const GAME_KEYS = [
  'away_team',
  'currency',
  'fee_minor',
  'game_id',
  'home_team',
  'league',
  'level',
  'local_date',
  'location_group',
  'open_slot_count',
  'slots',
  'start_at',
  'time_zone',
  'venue_name',
];

/**
 * Seeds a link for tenant `t1` and returns its token.
 * @param context The routes app under test.
 * @param overrides Fields of the link to replace.
 * @param link_id Primary key of the link.
 * @returns The token and the stored link.
 */
async function seed_link(
  context: IRoutesApp,
  overrides: Partial<IStoredQuickLink> = {},
  link_id = 'l1',
) {
  const token = generate_quick_link_token();
  const link = make_contract_quick_link('t1', link_id, {
    token_hash: hash_quick_link_token(token),
    ...overrides,
  });
  await context.quick_links.create_link(link);
  return { token, link };
}

/**
 * Seeds one open game for tenant `t1` that starts an hour from now.
 * @param context The routes app under test.
 * @param game_id Primary key of the game.
 * @param overrides Fields to replace.
 * @returns Resolves when stored.
 */
async function seed_game(
  context: IRoutesApp,
  game_id: string,
  overrides: Partial<IStoredGame> = {},
) {
  await context.harness.games.save_games([
    make_contract_game('t1', game_id, {
      start_at: context.harness.clock() + HOUR,
      local_date: Date.UTC(2027, 0, 16),
      ...overrides,
    }),
  ]);
}

/**
 * Gets a link's games.
 * @param context The routes app under test.
 * @param token The token in the URL.
 * @param query Query-string values.
 * @returns The supertest request.
 */
function get_games(context: IRoutesApp, token: string, query: Record<string, string> = {}) {
  return request(context.app).get(`/api/public/q/${token}/games`).query(query);
}

/**
 * Asserts the four headers every public response carries.
 * @param headers Response headers.
 * @returns Nothing.
 */
function expect_public_headers(headers: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(PUBLIC_HEADERS)) {
    expect(headers[name]).toBe(value);
  }
}

describe('GET /api/public/q/:token/games', () => {
  describe('a valid token', () => {
    it('needs no sign-in and serves exactly the documented shape', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);
      await seed_game(context, 'g1', {
        level: 'U12',
        league: 'Spring',
        home_team: 'Hawks',
        away_team: 'Eagles',
      });

      const response = await get_games(context, token);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body)).toEqual(['data']);
      expect(Object.keys(response.body.data).sort()).toEqual(RESPONSE_KEYS);
      expect(response.body.data).toMatchObject({
        as_of: context.harness.clock(),
        total: 1,
        levels: ['U12'],
        leagues: ['Spring'],
        location_groups: ['Location to be announced'],
      });
      const [location] = response.body.data.locations;
      expect(Object.keys(location).sort()).toEqual(['dates', 'location_label']);
      expect(Object.keys(location.dates[0]).sort()).toEqual(['games', 'local_date']);
      expect(Object.keys(location.dates[0].games[0]).sort()).toEqual(GAME_KEYS);
      expect(location.dates[0].local_date).toBe(Date.UTC(2027, 0, 16));
    });

    it('carries the public headers', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      expect_public_headers((await get_games(context, token)).headers);
    });

    it('never reveals organization names, assignees, fees, provider ids or raw data', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);
      const game = make_contract_game('t1', 'g1', {
        start_at: context.harness.clock() + HOUR,
        raw: { secret: 'raw payload' },
        external_id: 'provider-ext-id',
      });
      game.slots = [
        { ...game.slots[0]!, assignment_external_id: 'a-1', assignee_name: 'Pat Referee' },
        { ...game.slots[0]!, slot_id: 'slot_2', fees: [{ amount: 90 }] },
      ];
      await context.harness.games.save_games([game]);

      const response = await get_games(context, token);

      const served = response.body.data.locations[0].dates[0].games[0];
      expect(served).toMatchObject({ game_id: 'g1', fee_minor: null, currency: null });
      const serialized = JSON.stringify(response.body);
      for (const secret of ['Pat Referee', 'raw payload', 'provider-ext-id', 'org-1', 'c1"']) {
        expect(serialized).not.toContain(secret);
      }
    });

    it("serves only its own tenant's games", async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);
      await seed_game(context, 'mine');
      await context.harness.games.save_games([
        make_contract_game('t2', 'theirs', { start_at: context.harness.clock() + HOUR }),
      ]);

      const response = await get_games(context, token);

      expect(response.body.data.total).toBe(1);
      expect(JSON.stringify(response.body)).not.toContain('theirs');
    });

    it('applies the link scope and hides games that are cancelled, filled, started or not open', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context, {
        scope: { organization_ids: [], levels: ['U12'], date_start: null, date_end: null },
      });
      await seed_game(context, 'ok', { level: 'U12' });
      await seed_game(context, 'other_level', { level: 'U14' });
      await seed_game(context, 'cancelled', { level: 'U12', status: GameStatus.CANCELLED });
      await seed_game(context, 'started', { level: 'U12', start_at: context.harness.clock() - 1 });
      await seed_game(context, 'not_open', { level: 'U12', is_open: false, is_mine: true });

      const response = await get_games(context, token);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.locations[0].dates[0].games[0].game_id).toBe('ok');
    });

    it('filters by search, level, league and location, and still offers every option', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);
      await seed_game(context, 'a', { level: 'U12', league: 'Spring', home_team: 'Hawks' });
      await seed_game(context, 'b', { level: 'U14', league: 'Fall', home_team: 'Lions' });

      const by_level = await get_games(context, token, { level: 'u14' });
      const by_league = await get_games(context, token, { league: 'SPRING' });
      const by_search = await get_games(context, token, { search: 'hawk' });
      const by_location = await get_games(context, token, {
        location_group: 'location to be announced',
      });
      const by_other_location = await get_games(context, token, { location_group: 'Nowhere' });
      const blank = await get_games(context, token, { level: '  ', search: '' });

      expect(by_level.body.data.total).toBe(1);
      expect(by_level.body.data.locations[0].dates[0].games[0].game_id).toBe('b');
      expect(by_league.body.data.locations[0].dates[0].games[0].game_id).toBe('a');
      expect(by_search.body.data.locations[0].dates[0].games[0].game_id).toBe('a');
      expect(by_location.body.data.total).toBe(2);
      expect(by_other_location.body.data.total).toBe(0);
      expect(by_other_location.body.data.locations).toEqual([]);
      expect(blank.body.data.total).toBe(2);
      for (const narrowed of [by_level, by_league, by_search, by_other_location]) {
        expect(narrowed.body.data.levels).toEqual(['U12', 'U14']);
        expect(narrowed.body.data.leagues).toEqual(['Fall', 'Spring']);
      }
    });

    it('answers an empty list for a link with no games', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      const response = await get_games(context, token);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        as_of: context.harness.clock(),
        total: 0,
        locations: [],
        levels: [],
        leagues: [],
        location_groups: [],
      });
    });

    it.each([
      ['an unknown parameter', { tenant_id: 't2' }],
      ['a too long search', { search: 'a'.repeat(101) }],
    ])('answers 400 with violations for %s, with the public headers', async (_name, query) => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      const response = await get_games(context, token, query);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.violations.length).toBeGreaterThan(0);
      expect_public_headers(response.headers);
    });

    it('rejects a repeated parameter', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      const response = await request(context.app).get(
        `/api/public/q/${token}/games?level=a&level=b`,
      );

      expect(response.status).toBe(400);
    });
  });

  describe('a token that cannot be used', () => {
    /**
     * Seeds one link in each state, so a spec can compare their answers.
     * @param context The routes app under test.
     * @returns Named tokens that should all be refused.
     */
    async function unusable_tokens(context: IRoutesApp): Promise<Record<string, string>> {
      const revoked = await seed_link(context, { revoked_at: context.harness.clock() - 1 }, 'r');
      const expired = await seed_link(context, { expires_at: context.harness.clock() - 1 }, 'e');
      const both = await seed_link(
        context,
        { expires_at: context.harness.clock() - 1, revoked_at: context.harness.clock() - 1 },
        'b',
      );
      return {
        unknown: generate_quick_link_token(),
        revoked: revoked.token,
        expired: expired.token,
        revoked_and_expired: both.token,
        too_short: 'a'.repeat(42),
        too_long: 'a'.repeat(44),
        wrong_alphabet: `${'a'.repeat(42)}!`,
        padded: `${'a'.repeat(42)}=`,
        encoded_slash: `${'a'.repeat(40)}%2F${'a'}`,
        injection: encodeURIComponent("' OR 1=1 --").padEnd(43, 'a'),
      };
    }

    it('answers every one with the identical 404 body and the public headers', async () => {
      const context = make_routes_app();
      await seed_game(context, 'g1');

      for (const [reason, token] of Object.entries(await unusable_tokens(context))) {
        const response = await get_games(context, token);

        expect(response.status, reason).toBe(404);
        expect(response.body, reason).toEqual(NOT_AVAILABLE);
        expect(response.text, reason).toBe(JSON.stringify(NOT_AVAILABLE));
        expect_public_headers(response.headers);
      }
    });

    it('does the same lookup work for an unknown, revoked and expired token', async () => {
      const context = make_routes_app();
      const tokens = await unusable_tokens(context);
      const find = vi.spyOn(context.quick_links, 'find_by_token_hash');

      for (const reason of ['unknown', 'revoked', 'expired']) {
        find.mockClear();
        await get_games(context, tokens[reason]!);
        expect(find, reason).toHaveBeenCalledTimes(1);
        expect(find, reason).toHaveBeenCalledWith(hash_quick_link_token(tokens[reason]!));
      }
    });

    it('never looks up a malformed token', async () => {
      const context = make_routes_app();
      const find = vi.spyOn(context.quick_links, 'find_by_token_hash');

      await get_games(context, 'short');

      expect(find).not.toHaveBeenCalled();
    });

    it('answers 404 before validating the query, so a bad query reveals nothing', async () => {
      const context = make_routes_app();

      const response = await get_games(context, generate_quick_link_token(), { bogus: '1' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_AVAILABLE);
    });

    it('does not count the attempt as a view', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context, { revoked_at: 1 });

      await get_games(context, token);

      expect((await context.quick_links.get_link('t1', 'l1'))?.view_count).toBe(0);
    });

    it('logs nothing, so a token never reaches the logs', async () => {
      const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined),
      );
      const context = make_routes_app();
      const token = generate_quick_link_token();

      await get_games(context, token);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });
  });

  describe('other paths under /api/public', () => {
    it('stay behind sign-in, and carry the public headers either way', async () => {
      const context = make_routes_app();

      const response = await request(context.app).get('/api/public/nothing');

      expect(response.status).toBe(401);
      expect_public_headers(response.headers);
    });
  });

  describe('views', () => {
    it('counts each successful view and remembers the latest', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      await get_games(context, token);
      context.harness.advance(5000);
      await get_games(context, token, { level: 'U12' });

      expect(await context.quick_links.get_link('t1', 'l1')).toMatchObject({
        view_count: 2,
        last_viewed_at: context.harness.clock(),
      });
    });

    it('does not count a request rejected as invalid', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);

      await get_games(context, token, { bogus: '1' });

      expect((await context.quick_links.get_link('t1', 'l1'))?.view_count).toBe(0);
    });

    it('still answers 200 when recording the view fails, and logs the real error', async () => {
      const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const context = make_routes_app();
      const { token } = await seed_link(context);
      await seed_game(context, 'g1');
      const failure = new Error('write conflict');
      context.quick_links.record_view = async () => {
        throw failure;
      };

      const response = await get_games(context, token);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(1);
      expect(error_spy).toHaveBeenCalledWith(expect.any(String), 'l1', failure);
      error_spy.mockRestore();
    });

    it('shows the view to the owner in the link list', async () => {
      const context = make_routes_app();
      const { token } = await seed_link(context);
      await get_games(context, token);

      expect((await context.quick_links.list_links('t1'))[0]).toMatchObject({ view_count: 1 });
    });
  });

  describe('failures', () => {
    it('answers 500 with the public headers and without the cause when the store fails', async () => {
      const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const context = make_routes_app();
      const { token } = await seed_link(context);
      context.harness.games.list_games = async () => {
        throw new Error('spanner exploded');
      };

      const response = await get_games(context, token);

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('spanner exploded');
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect_public_headers(response.headers);
      error_spy.mockRestore();
    });
  });
});

/**
 * Builds a limiter with a clock the spec moves.
 * @param capacity Burst size.
 * @param clock Clock to read.
 * @returns The limiter.
 */
function make_limiter(capacity: number, clock: () => number): IRateLimiter {
  return new TokenBucketRateLimiter({
    capacity,
    refill_per_minute: 60,
    max_keys: 100,
    now: clock,
  });
}

describe('rate limiting of GET /api/public/q/:token/games', () => {
  /**
   * Builds an app whose limiters are tiny and share a clock the spec moves.
   * @param options Extra app options.
   * @param capacities Burst sizes of the request and failure limiters.
   * @returns The app and the clock controls.
   */
  function make_limited_app(
    options: IRoutesAppOptions = {},
    capacities: { requests: number; failures: number } = { requests: 3, failures: 2 },
  ) {
    let time = 1_000_000;
    const clock = () => time;
    const context = make_routes_app({
      request_limiter: make_limiter(capacities.requests, clock),
      failure_limiter: make_limiter(capacities.failures, clock),
      ...options,
    });
    return { context, advance: (ms: number) => (time += ms) };
  }

  it('answers 429 with Retry-After, a code and the public headers once the allowance is used', async () => {
    const { context } = make_limited_app();
    const { token } = await seed_link(context);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await get_games(context, token)).status);
    const limited = await get_games(context, token);

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again shortly',
    });
    expect(limited.headers['retry-after']).toBe('1');
    expect_public_headers(limited.headers);
  });

  it('lets the client back in as the allowance refills', async () => {
    const { context, advance } = make_limited_app();
    const { token } = await seed_link(context);
    for (let i = 0; i < 4; i++) await get_games(context, token);

    advance(1000);

    expect((await get_games(context, token)).status).toBe(200);
  });

  it('answers the same 429 for a good and a bad token, and does no lookup while limited', async () => {
    const { context } = make_limited_app({}, { requests: 1, failures: 5 });
    const { token } = await seed_link(context);
    await get_games(context, token);
    const find = vi.spyOn(context.quick_links, 'find_by_token_hash');

    const good = await get_games(context, token);
    const bad = await get_games(context, generate_quick_link_token());

    expect(good.status).toBe(429);
    expect(bad.status).toBe(429);
    expect(good.body).toEqual(bad.body);
    expect(find).not.toHaveBeenCalled();
  });

  it('throttles token guessing harder: failed lookups use a separate, smaller allowance', async () => {
    const { context } = make_limited_app({}, { requests: 100, failures: 2 });
    const { token } = await seed_link(context);

    const guesses: number[] = [];
    for (let i = 0; i < 2; i++) {
      guesses.push((await get_games(context, generate_quick_link_token())).status);
    }
    const blocked = await get_games(context, generate_quick_link_token());
    const even_a_good_token = await get_games(context, token);

    expect(guesses).toEqual([404, 404]);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(even_a_good_token.status).toBe(429);
  });

  it('counts a malformed token as a failed lookup', async () => {
    const { context } = make_limited_app({}, { requests: 100, failures: 1 });

    const first = await get_games(context, 'short');
    const second = await get_games(context, 'short');

    expect([first.status, second.status]).toEqual([404, 429]);
  });

  it('does not spend the failure allowance on successful views', async () => {
    const { context } = make_limited_app({}, { requests: 100, failures: 1 });
    const { token } = await seed_link(context);

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await get_games(context, token)).status);

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });

  it('limits each client address on its own', async () => {
    const { context } = make_limited_app({ trust_proxy_hops: 1 }, { requests: 1, failures: 1 });
    const { token } = await seed_link(context);

    const from = (ip: string) => get_games(context, token).set('X-Forwarded-For', ip);

    expect((await from('203.0.113.1')).status).toBe(200);
    expect((await from('203.0.113.1')).status).toBe(429);
    expect((await from('203.0.113.2')).status).toBe(200);
  });

  describe('which address is limited', () => {
    /**
     * Builds a limiter that allows everything and records the keys it was asked about.
     * @returns The limiter and the keys seen.
     */
    function make_recording_limiter() {
      const keys: string[] = [];
      const limiter: IRateLimiter = {
        try_consume: (key) => {
          keys.push(key);
          return { allowed: true, retry_after_seconds: 0 };
        },
        peek: () => ({ allowed: true, retry_after_seconds: 0 }),
      };
      return { limiter, keys };
    }

    it('is the socket address, ignoring X-Forwarded-For, when no proxy is trusted', async () => {
      const { limiter, keys } = make_recording_limiter();
      const context = make_routes_app({ request_limiter: limiter });

      await get_games(context, 'short').set('X-Forwarded-For', '203.0.113.9');
      await get_games(context, 'short').set('X-Forwarded-For', '198.51.100.7');

      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[0]).not.toContain('203.0.113.9');
    });

    it('is the address the trusted proxies report, not what the client claims', async () => {
      const { limiter, keys } = make_recording_limiter();
      const context = make_routes_app({ request_limiter: limiter, trust_proxy_hops: 2 });

      // The client really is 203.0.113.5 (seen by the edge, which also adds its own address);
      // everything further left is whatever the client chose to send.
      await get_games(context, 'short').set(
        'X-Forwarded-For',
        '9.9.9.9, 203.0.113.5, 198.51.100.1',
      );
      await get_games(context, 'short').set(
        'X-Forwarded-For',
        '8.8.8.8, 7.7.7.7, 203.0.113.5, 198.51.100.1',
      );

      expect(keys).toEqual(['203.0.113.5', '203.0.113.5']);
    });
  });
});
