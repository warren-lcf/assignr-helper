import { hash_bearer_token } from '@hch-shared-libraries/core-server';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { TokenBucketRateLimiter } from '../http/rate_limit/token_bucket_rate_limiter.js';
import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IRoutesApp, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { create_public_calendar_feed_router } from './public_calendar_feed.routes.js';
import { PublicCalendarFeedService } from './public_calendar_feed.service.js';
import { InMemoryCalendarFeedStore } from './stores/in_memory_calendar_feed_store.js';

const DAY = 86_400_000;
const NOT_AVAILABLE = { code: 'NOT_FOUND', message: 'This link is not available' };
const PUBLIC_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};

/**
 * Creates tenant t1's feed through the owner API.
 * @param context The routes app under test.
 * @param token_value Which owner creates it (default tenant-A owner).
 * @returns The token.
 */
async function create_token(context: IRoutesApp, token_value = 'owner-a'): Promise<string> {
  const response = await request(context.app)
    .post('/api/my_schedule/feed')
    .set({ Authorization: `Bearer ${token_value}` });
  return response.body.data.token as string;
}

/**
 * Seeds one game the account holds.
 * @param context The routes app under test.
 * @param game_id Primary key.
 * @param overrides Fields to replace.
 * @param tenant_id Owning tenant.
 * @returns Resolves when stored.
 */
async function seed_game(
  context: IRoutesApp,
  game_id: string,
  overrides: Partial<IStoredGame> = {},
  tenant_id = 't1',
) {
  await context.harness.games.save_games([
    make_contract_game(tenant_id, game_id, {
      start_at: context.harness.clock() + DAY,
      is_open: false,
      is_mine: true,
      home_team: 'Hawks',
      away_team: 'Eagles',
      slots: [
        {
          slot_id: 's1',
          position: 'Referee',
          assignee_name: null,
          assignment_external_id: 'a-1',
          response_status: AssignmentResponseStatus.UNRESPONDED,
          is_mine: true,
          lock_version: null,
          fees: [],
        },
      ],
      ...overrides,
    }),
  ]);
}

/**
 * Gets the public feed.
 * @param context The routes app under test.
 * @param token_file The last URL segment.
 * @returns The supertest request.
 */
function get_feed(context: IRoutesApp, token_file: string) {
  return request(context.app).get(`/api/public/cal/${token_file}`);
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

/**
 * Builds a small limiter, so a spec can reach the limit.
 * @param capacity Requests allowed in a burst.
 * @param now Clock.
 * @returns The limiter.
 */
function small_limiter(capacity: number, now: () => number): IRateLimiter {
  return new TokenBucketRateLimiter({ capacity, refill_per_minute: capacity, max_keys: 100, now });
}

describe('GET /api/public/cal/:token_file', () => {
  describe('a valid token', () => {
    it('needs no sign-in and serves a calendar with the right type and file name', async () => {
      const context = make_routes_app();
      const token = await create_token(context);
      await seed_game(context, 'g1');

      const response = await get_feed(context, `${token}.ics`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/calendar; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('inline; filename="my-schedule.ics"');
      expect(response.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
      expect(response.text.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(response.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
      expect(response.text).toContain('UID:game-g1@hch-calendar-feed');
      expect(response.text).toContain('SUMMARY:Hawks vs Eagles (Referee)');
    });

    it('carries the public headers', async () => {
      const context = make_routes_app();
      const token = await create_token(context);

      expect_public_headers((await get_feed(context, `${token}.ics`)).headers);
    });

    it('serves an empty calendar when no game qualifies', async () => {
      const context = make_routes_app();
      const token = await create_token(context);

      const response = await get_feed(context, `${token}.ics`);

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('BEGIN:VEVENT');
    });

    it('ignores a query string, which some calendar apps append', async () => {
      const context = make_routes_app();
      const token = await create_token(context);

      expect((await get_feed(context, `${token}.ics?x=1&y=2`)).status).toBe(200);
    });

    it('serves only the games of the tenant the token belongs to', async () => {
      const context = make_routes_app();
      const token_a = await create_token(context, 'owner-a');
      const token_b = await create_token(context, 'owner-b');
      await seed_game(context, 'mine_a', { home_team: 'Alpha FC' }, 't1');
      await seed_game(context, 'mine_b', { home_team: 'Beta United' }, 't2');

      const a = await get_feed(context, `${token_a}.ics`);
      const b = await get_feed(context, `${token_b}.ics`);

      expect(a.text).toContain('game-mine_a@');
      expect(a.text).not.toContain('mine_b');
      expect(a.text).not.toContain('Beta United');
      expect(b.text).toContain('game-mine_b@');
      expect(b.text).not.toContain('mine_a');
      expect(b.text).not.toContain('Alpha FC');
    });

    it('leaves out cancelled, removed and not-mine games', async () => {
      const context = make_routes_app();
      const token = await create_token(context);
      await seed_game(context, 'kept');
      await seed_game(context, 'cancelled', { status: GameStatus.CANCELLED });
      await seed_game(context, 'removed', { removed_at: 1 });
      await seed_game(context, 'open_only', { is_mine: false, is_open: true });

      const response = await get_feed(context, `${token}.ics`);

      expect(response.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
      expect(response.text).toContain('game-kept@');
    });

    it('never reveals other officials, fees, provider ids or the raw payload', async () => {
      const context = make_routes_app();
      const token = await create_token(context);
      const game = make_contract_game('t1', 'g1', {
        start_at: context.harness.clock() + DAY,
        is_open: false,
        is_mine: true,
        external_id: 'provider-ext-id',
        raw: { secret: 'raw payload' },
      });
      game.slots = [
        {
          ...game.slots[0]!,
          is_mine: true,
          assignment_external_id: 'a-1',
          fees: [{ amount: 9001 }],
        },
        {
          ...game.slots[0]!,
          slot_id: 'slot_2',
          position: 'Asst. Referee',
          is_mine: false,
          assignment_external_id: 'a-2',
          assignee_name: 'Pat Official',
          fees: [{ amount: 7777 }],
        },
      ];
      await context.harness.games.save_games([game]);

      const response = await get_feed(context, `${token}.ics`);

      expect(response.status).toBe(200);
      for (const secret of [
        'Pat Official',
        'raw payload',
        'provider-ext-id',
        '9001',
        '7777',
        'Asst. Referee',
      ]) {
        expect(response.text).not.toContain(secret);
      }
    });
  });

  describe('a token that cannot be used', () => {
    /**
     * Makes one token in each unusable state, so a spec can compare their answers.
     * @param context The routes app under test.
     * @returns Named last URL segments that should all be refused.
     */
    async function unusable_segments(context: IRoutesApp): Promise<Record<string, string>> {
      const revoked = await create_token(context);
      await request(context.app)
        .delete('/api/my_schedule/feed')
        .set({ Authorization: 'Bearer owner-a' });
      const rotated_out = await create_token(context);
      await request(context.app)
        .post('/api/my_schedule/feed/rotate')
        .set({ Authorization: 'Bearer owner-a' });
      const live = await create_token(context, 'owner-b');
      return {
        unknown: `${'A'.repeat(43)}.ics`,
        revoked: `${revoked}.ics`,
        rotated_out: `${rotated_out}.ics`,
        valid_token_without_extension: live,
        valid_token_wrong_extension: `${live}.txt`,
        valid_token_upper_extension: `${live}.ICS`,
        valid_token_double_extension: `${live}.ics.ics`,
        too_short: `${'a'.repeat(42)}.ics`,
        too_long: `${'a'.repeat(44)}.ics`,
        wrong_alphabet: `${'a'.repeat(42)}!.ics`,
        padded: `${'a'.repeat(42)}=.ics`,
        encoded_slash: `${'a'.repeat(40)}%2F${'a'}.ics`,
        injection: `${encodeURIComponent("' OR 1=1 --").padEnd(43, 'a')}.ics`,
        only_extension: '.ics',
      };
    }

    it('answers every one with the byte-identical 404 body and the public headers', async () => {
      const context = make_routes_app();
      await seed_game(context, 'g1');
      const segments = await unusable_segments(context);

      const bodies = new Set<string>();
      for (const [reason, segment] of Object.entries(segments)) {
        const response = await get_feed(context, segment);

        expect(response.status, reason).toBe(404);
        expect(response.body, reason).toEqual(NOT_AVAILABLE);
        expect(response.text, reason).toBe(JSON.stringify(NOT_AVAILABLE));
        expect_public_headers(response.headers);
        bodies.add(response.text);
      }
      expect(bodies.size).toBe(1);
    });

    it('does the same lookup work for an unknown, a revoked and a rotated-out token', async () => {
      const context = make_routes_app();
      const segments = await unusable_segments(context);
      const find = vi.spyOn(context.calendar_feeds, 'find_subscriber_by_token_hash');

      for (const reason of ['unknown', 'revoked', 'rotated_out']) {
        find.mockClear();
        const token = segments[reason]!.slice(0, 43);

        await get_feed(context, segments[reason]!);

        expect(find, reason).toHaveBeenCalledTimes(1);
        expect(find, reason).toHaveBeenCalledWith(hash_bearer_token(token));
      }
    });

    it('never looks up a malformed token', async () => {
      const context = make_routes_app();
      const find = vi.spyOn(context.calendar_feeds, 'find_subscriber_by_token_hash');

      for (const segment of ['short.ics', `${'a'.repeat(43)}`, `${'a'.repeat(43)}.txt`, '.ics']) {
        await get_feed(context, segment);
      }

      expect(find).not.toHaveBeenCalled();
    });

    it('records no fetch for any of them', async () => {
      const context = make_routes_app();
      const live = await create_token(context);
      const record = vi.spyOn(context.calendar_feeds, 'record_fetch');

      await get_feed(context, `${'A'.repeat(43)}.ics`);
      await get_feed(context, `${live}`);
      await get_feed(context, 'short.ics');

      expect(record).not.toHaveBeenCalled();
      expect((await context.calendar_feeds.get_feed('t1'))?.fetch_count).toBe(0);
    });

    it('logs nothing, so a token never reaches the logs', async () => {
      const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined),
      );
      const context = make_routes_app();

      await get_feed(context, `${'A'.repeat(43)}.ics`);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });
  });

  describe('fetch recording', () => {
    it('counts each successful fetch and remembers the latest time', async () => {
      const context = make_routes_app();
      const token = await create_token(context);

      await get_feed(context, `${token}.ics`);
      context.harness.advance(5000);
      await get_feed(context, `${token}.ics`);

      expect(await context.calendar_feeds.get_feed('t1')).toMatchObject({
        fetch_count: 2,
        last_fetched_at: context.harness.clock(),
      });
    });

    it('never fails the request when recording the fetch fails, and does not log the token', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const feeds = new InMemoryCalendarFeedStore();
      const context = make_routes_app({ calendar_feeds: feeds });
      const token = await create_token(context);
      await seed_game(context, 'g1');
      vi.spyOn(feeds, 'record_fetch').mockRejectedValue(new Error('spanner unavailable'));

      const response = await get_feed(context, `${token}.ics`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('UID:game-g1@');
      expect(error).toHaveBeenCalled();
      expect(JSON.stringify(error.mock.calls)).not.toContain(token);
      error.mockRestore();
    });
  });

  describe('rate limits', () => {
    it('answers 429 with Retry-After and the public headers once a client exceeds the request limit', async () => {
      const context = make_routes_app({
        calendar_request_limiter: small_limiter(2, () => 1_800_000_000_000),
      });
      const token = await create_token(context);

      const statuses: number[] = [];
      let last = await get_feed(context, `${token}.ics`);
      statuses.push(last.status);
      for (let i = 0; i < 2; i++) {
        last = await get_feed(context, `${token}.ics`);
        statuses.push(last.status);
      }

      expect(statuses).toEqual([200, 200, 429]);
      expect(last.headers['retry-after']).toMatch(/^\d+$/);
      expect(last.body.code).toBe('RATE_LIMITED');
      expect_public_headers(last.headers);
    });

    it('lets many valid fetches through, since calendar providers share addresses', async () => {
      const context = make_routes_app({
        calendar_request_limiter: new TokenBucketRateLimiter({
          capacity: 600,
          refill_per_minute: 600,
          max_keys: 100,
          now: () => 1_800_000_000_000,
        }),
        calendar_failure_limiter: small_limiter(3, () => 1_800_000_000_000),
      });
      const token = await create_token(context);

      const statuses = new Set<number>();
      for (let i = 0; i < 100; i++) {
        statuses.add((await get_feed(context, `${token}.ics`)).status);
      }

      expect([...statuses]).toEqual([200]);
    });

    it('throttles failed lookups, refusing even a valid token until the allowance returns', async () => {
      const failure_limiter = small_limiter(2, () => 1_800_000_000_000);
      const context = make_routes_app({ calendar_failure_limiter: failure_limiter });
      const token = await create_token(context);
      const find = vi.spyOn(context.calendar_feeds, 'find_subscriber_by_token_hash');

      const bad = [
        (await get_feed(context, `${'A'.repeat(43)}.ics`)).status,
        (await get_feed(context, `${'B'.repeat(43)}.ics`)).status,
      ];
      find.mockClear();
      const limited = await get_feed(context, `${token}.ics`);

      expect(bad).toEqual([404, 404]);
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toMatch(/^\d+$/);
      expect_public_headers(limited.headers);
      expect(find).not.toHaveBeenCalled();
    });

    it('counts malformed tokens as failures too', async () => {
      const context = make_routes_app({
        calendar_failure_limiter: small_limiter(2, () => 1_800_000_000_000),
      });

      const statuses = [
        (await get_feed(context, 'a.ics')).status,
        (await get_feed(context, 'b.ics')).status,
        (await get_feed(context, 'c.ics')).status,
      ];

      expect(statuses).toEqual([404, 404, 429]);
    });

    it('does not spend failed-lookup allowance on successful fetches', async () => {
      const context = make_routes_app({
        calendar_failure_limiter: small_limiter(2, () => 1_800_000_000_000),
      });
      const token = await create_token(context);

      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await get_feed(context, `${token}.ics`)).status);
      }

      expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('limits per client address as the trusted proxy reports it', async () => {
      const context = make_routes_app({
        trust_proxy_hops: 1,
        calendar_failure_limiter: small_limiter(1, () => 1_800_000_000_000),
      });
      const as = (address: string) =>
        get_feed(context, `${'A'.repeat(43)}.ics`).set('X-Forwarded-For', address);

      expect((await as('203.0.113.1')).status).toBe(404);
      expect((await as('203.0.113.1')).status).toBe(429);
      expect((await as('203.0.113.2')).status).toBe(404);
    });
  });
});

describe('the public calendar feed router on its own', () => {
  /**
   * Mounts only this router, so no other router can supply the headers.
   * @param request_limiter Limits every request.
   * @returns The app.
   */
  function make_bare_app(request_limiter: IRateLimiter) {
    const service = {
      open_feed: async (token: string) => (token === 'T'.repeat(43) ? 't1' : null),
      render_ics: async () =>
        ['BEGIN:VCALENDAR', 'END:VCALENDAR', ''].join(String.fromCharCode(13, 10)),
    } as unknown as PublicCalendarFeedService;
    const app = express();
    app.use(
      '/api',
      create_public_calendar_feed_router({
        service,
        request_limiter,
        failure_limiter: small_limiter(100, () => 1_800_000_000_000),
      }),
    );
    return app;
  }

  it('sets the public headers on a 200, a 404 and a 429 by itself', async () => {
    const app = make_bare_app(small_limiter(2, () => 1_800_000_000_000));

    const ok = await request(app).get(`/api/public/cal/${'T'.repeat(43)}.ics`);
    const not_found = await request(app).get(`/api/public/cal/${'U'.repeat(43)}.ics`);
    const limited = await request(app).get(`/api/public/cal/${'T'.repeat(43)}.ics`);

    expect([ok.status, not_found.status, limited.status]).toEqual([200, 404, 429]);
    for (const response of [ok, not_found, limited]) {
      expect_public_headers(response.headers);
    }
  });
});
