import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACTING_TENANT_HEADER } from '../auth/create_auth_middleware.js';
import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { GAMES_LIST_LIMITS } from './games_list_limits.constant.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** One game as the API returns it, reduced to what these specs read. */
interface IApiGame {
  game_id: string;
  [key: string]: unknown;
}

/** One location group as the API returns it. */
interface IApiLocation {
  location_label: string;
  dates: { local_date: number | null; games: IApiGame[] }[];
}

/**
 * Seeds one stored game for tenant `t1`, connection `c1` unless overridden. By default it starts
 * an hour from now so the default window includes it.
 * @param context The routes app under test.
 * @param game_id Primary key of the game.
 * @param overrides Fields to replace.
 * @returns Resolves when the game is stored.
 */
async function seed_game(
  context: IRoutesApp,
  game_id: string,
  overrides: Partial<IStoredGame> = {},
): Promise<void> {
  await context.harness.games.save_games([
    make_contract_game('t1', game_id, {
      start_at: context.harness.clock() + HOUR,
      local_date: Date.UTC(2026, 9, 10),
      ...overrides,
    }),
  ]);
}

/**
 * Gets `/api/games` as a tenant owner.
 * @param context The routes app under test.
 * @param query Query-string values.
 * @param token Bearer token to sign in with.
 * @returns The supertest response.
 */
function get_games(
  context: IRoutesApp,
  query: Record<string, string> = {},
  token: string = ROUTE_TOKENS.owner_a,
) {
  return request(context.app).get('/api/games').query(query).set(auth(token));
}

/**
 * Flattens a response into game ids in display order.
 * @param body Response body.
 * @returns Game ids, location by location and date by date.
 */
function ids_in(body: { data: { locations: IApiLocation[] } }): string[] {
  return body.data.locations.flatMap((location) =>
    location.dates.flatMap((date) => date.games.map((game) => game.game_id)),
  );
}

describe('GET /api/games', () => {
  it('requires sign-in', async () => {
    const context = make_routes_app();

    expect((await request(context.app).get('/api/games')).status).toBe(401);
  });

  it('lets a member read an empty list', async () => {
    const context = make_routes_app();

    const response = await get_games(context, {}, ROUTE_TOKENS.member_a);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { locations: [], total: 0, truncated: false } });
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await get_games(context, {}, ROUTE_TOKENS.admin);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('serves a platform administrator who acts in a tenant', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');

    const response = await get_games(context, {}, ROUTE_TOKENS.admin).set(
      ACTING_TENANT_HEADER,
      't1',
    );

    expect(response.status).toBe(200);
    expect(ids_in(response.body)).toEqual(['g1']);
  });

  it('answers the tenant requirement before judging the query', async () => {
    const context = make_routes_app();

    const response = await get_games(context, { scope: 'bad' }, ROUTE_TOKENS.admin);

    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('returns the full view of a game, resolved names included, and nothing internal', async () => {
    const context = make_routes_app();
    const [organization] = await context.harness.organizations.upsert_organizations(
      't1',
      'c1',
      [{ external_id: '101', name: 'Metro Soccer', flags: {} }],
      'a',
      1,
    );
    const [venue] = await context.harness.venues.upsert_venues(
      't1',
      'c1',
      [
        {
          external_id: 'v-1',
          name: 'Field 1',
          address_line: '1 Main St',
          city: null,
          region: null,
          postal_code: null,
          latitude: null,
          longitude: null,
          time_zone: null,
        },
      ],
      'a',
      1,
    );
    const start_at = context.harness.clock() + HOUR;
    await seed_game(context, 'g1', {
      organization_id: organization!.organization_id,
      venue_id: venue!.venue_id,
      start_at,
      end_at: start_at + HOUR,
      league: 'Metro League',
      home_team: 'Thunder',
      away_team: 'Lightning',
      raw: { secret: 'payload' },
      slots: [
        {
          slot_id: 'slot_0',
          position: 'Referee',
          assignee_name: 'Pat Doe',
          assignment_external_id: 'asg-1',
          response_status: AssignmentResponseStatus.ACCEPTED,
          is_mine: true,
          lock_version: null,
          fees: [{ amount: 55 }],
        },
        {
          slot_id: 'slot_1',
          position: 'Assistant Referee',
          assignee_name: null,
          assignment_external_id: null,
          response_status: AssignmentResponseStatus.UNRESPONDED,
          is_mine: false,
          lock_version: null,
          fees: [],
        },
      ],
    });

    const response = await get_games(context);

    expect(response.status).toBe(200);
    expect(response.body.data.locations[0].location_label).toBe('Field 1');
    expect(response.body.data.locations[0].dates[0].games[0]).toEqual({
      game_id: 'g1',
      connection_id: 'c1',
      organization_id: organization!.organization_id,
      organization_name: 'Metro Soccer',
      venue_name: 'Field 1',
      location_group: null,
      local_date: Date.UTC(2026, 9, 10),
      time_zone: null,
      start_at,
      end_at: start_at + HOUR,
      status: GameStatus.SCHEDULED,
      level: null,
      league: 'Metro League',
      age_group: null,
      game_type: null,
      gender: null,
      home_team: 'Thunder',
      away_team: 'Lightning',
      is_open: true,
      is_mine: false,
      open_slot_count: 1,
      open_positions: ['Assistant Referee'],
      slots: [
        { position: 'Referee', state: 'MINE' },
        { position: 'Assistant Referee', state: 'OPEN' },
      ],
      total_slot_count: 2,
      my_position: 'Referee',
      fee_minor: null,
      currency: null,
    });
    const serialized = JSON.stringify(response.body);
    for (const hidden of ['payload', 'Pat Doe', 'asg-1', '"tenant_id"', '"raw"', 'fingerprint']) {
      expect(serialized).not.toContain(hidden);
    }
  });

  describe('tenant isolation', () => {
    it('never lists another tenant games, venues or organizations', async () => {
      const context = make_routes_app();
      await seed_game(context, 'mine');
      await context.harness.games.save_games([
        make_contract_game('t2', 'theirs', { start_at: context.harness.clock() + HOUR }),
      ]);

      const as_a = await get_games(context);
      const as_b = await get_games(context, {}, ROUTE_TOKENS.owner_b);

      expect(ids_in(as_a.body)).toEqual(['mine']);
      expect(ids_in(as_b.body)).toEqual(['theirs']);
    });

    it('ignores a tenant id smuggled into the query', async () => {
      const context = make_routes_app();
      await context.harness.games.save_games([
        make_contract_game('t2', 'theirs', { start_at: context.harness.clock() + HOUR }),
      ]);

      const response = await get_games(context, { tenant_id: 't2' });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toContain('theirs');
    });

    it('does not let an owner act in another tenant', async () => {
      const context = make_routes_app();
      await context.harness.games.save_games([
        make_contract_game('t2', 'theirs', { start_at: context.harness.clock() + HOUR }),
      ]);

      const response = await get_games(context).set(ACTING_TENANT_HEADER, 't2');

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('theirs');
    });
  });

  describe('scope', () => {
    /**
     * Seeds one open, one mine and one both-open-and-mine game.
     * @param context The routes app under test.
     * @returns Resolves when seeded.
     */
    async function seed_scopes(context: IRoutesApp): Promise<void> {
      const now = context.harness.clock();
      await seed_game(context, 'open', { is_open: true, is_mine: false, start_at: now + HOUR });
      await seed_game(context, 'mine', { is_open: false, is_mine: true, start_at: now + 2 * HOUR });
      await seed_game(context, 'both', { is_open: true, is_mine: true, start_at: now + 3 * HOUR });
      await seed_game(context, 'neither', {
        is_open: false,
        is_mine: false,
        start_at: now + 4 * HOUR,
      });
    }

    it('lists open games by default', async () => {
      const context = make_routes_app();
      await seed_scopes(context);

      expect(ids_in((await get_games(context)).body)).toEqual(['open', 'both']);
    });

    it.each([
      ['OPEN', ['open', 'both']],
      ['MINE', ['mine', 'both']],
      ['ALL', ['open', 'mine', 'both']],
    ])('lists %s games', async (scope, expected) => {
      const context = make_routes_app();
      await seed_scopes(context);

      const response = await get_games(context, { scope });

      expect(ids_in(response.body)).toEqual(expected);
      expect(response.body.data.total).toBe(expected.length);
    });
  });

  describe('exclusions', () => {
    it('never lists removed games', async () => {
      const context = make_routes_app();
      await seed_game(context, 'live');
      await seed_game(context, 'gone', { removed_at: 1, is_open: false, is_mine: false });
      await seed_game(context, 'gone_but_flagged', { removed_at: 1 });

      expect(ids_in((await get_games(context, { scope: 'ALL' })).body)).toEqual(['live']);
    });

    it('hides cancelled games unless asked to include them', async () => {
      const context = make_routes_app();
      await seed_game(context, 'live');
      await seed_game(context, 'cancelled', {
        status: GameStatus.CANCELLED,
        start_at: context.harness.clock() + 2 * HOUR,
      });

      expect(ids_in((await get_games(context)).body)).toEqual(['live']);
      expect(ids_in((await get_games(context, { include_cancelled: 'true' })).body)).toEqual([
        'live',
        'cancelled',
      ]);
      expect(ids_in((await get_games(context, { include_cancelled: 'false' })).body)).toEqual([
        'live',
      ]);
    });
  });

  describe('window', () => {
    it('defaults to three hours back and 120 days ahead', async () => {
      const context = make_routes_app();
      const now = context.harness.clock();
      await seed_game(context, 'too_old', { start_at: now - 3 * HOUR - 1 });
      await seed_game(context, 'just_started', { start_at: now - 3 * HOUR });
      await seed_game(context, 'last_day', { start_at: now + 120 * DAY });
      await seed_game(context, 'too_far', { start_at: now + 120 * DAY + 1 });

      expect(ids_in((await get_games(context)).body)).toEqual(['just_started', 'last_day']);
    });

    it('honours explicit from and to, both inclusive', async () => {
      const context = make_routes_app();
      const now = context.harness.clock();
      await seed_game(context, 'before', { start_at: now - 10 * DAY - 1 });
      await seed_game(context, 'at_from', { start_at: now - 10 * DAY });
      await seed_game(context, 'at_to', { start_at: now - 5 * DAY });
      await seed_game(context, 'after', { start_at: now - 5 * DAY + 1 });

      const response = await get_games(context, {
        from: String(now - 10 * DAY),
        to: String(now - 5 * DAY),
      });

      expect(ids_in(response.body)).toEqual(['at_from', 'at_to']);
    });
  });

  describe('search and filters', () => {
    /**
     * Seeds two organizations, two connections and games that differ in every filterable field.
     * @param context The routes app under test.
     * @returns The ids of the two organizations.
     */
    async function seed_filterable(context: IRoutesApp): Promise<{ org_a: string; org_b: string }> {
      const [org_a] = await context.harness.organizations.upsert_organizations(
        't1',
        'c1',
        [{ external_id: '101', name: 'Valley Referees', flags: {} }],
        'a',
        1,
      );
      const [org_b] = await context.harness.organizations.upsert_organizations(
        't1',
        'c2',
        [{ external_id: '202', name: 'Harbor Assignors', flags: {} }],
        'a',
        1,
      );
      const [venue_a] = await context.harness.venues.upsert_venues(
        't1',
        'c1',
        [
          {
            external_id: 'v-a',
            name: 'Algonkian Field',
            address_line: null,
            city: null,
            region: null,
            postal_code: null,
            latitude: null,
            longitude: null,
            time_zone: null,
          },
        ],
        'a',
        1,
      );
      const now = context.harness.clock();
      await seed_game(context, 'alpha', {
        connection_id: 'c1',
        organization_id: org_a!.organization_id,
        venue_id: venue_a!.venue_id,
        start_at: now + HOUR,
        league: 'Metro League',
        level: 'Premier',
        age_group: 'U12',
        home_team: 'Thunder FC',
        away_team: 'Lightning SC',
      });
      await seed_game(context, 'beta', {
        connection_id: 'c2',
        organization_id: org_b!.organization_id,
        venue_id: null,
        start_at: now + 2 * HOUR,
        league: 'County Cup',
        level: 'Select',
        age_group: 'U14',
        home_team: 'Rovers',
        away_team: 'United',
        slots: [],
      });
      return { org_a: org_a!.organization_id, org_b: org_b!.organization_id };
    }

    it.each([
      ['home team', 'thunder', ['alpha']],
      ['away team', 'UNITED', ['beta']],
      ['league', 'county', ['beta']],
      ['level', 'premi', ['alpha']],
      ['age group', 'u14', ['beta']],
      ['venue', 'algonk', ['alpha']],
      ['organization', 'harbor', ['beta']],
      ['nothing', 'zzz', []],
      ['a blank search', '   ', ['alpha', 'beta']],
    ])('searches by %s', async (_label, search, expected) => {
      const context = make_routes_app();
      await seed_filterable(context);

      const response = await get_games(context, { search });

      expect(ids_in(response.body)).toEqual(expected);
    });

    it('filters by connection', async () => {
      const context = make_routes_app();
      await seed_filterable(context);

      expect(ids_in((await get_games(context, { connection_id: 'c2' })).body)).toEqual(['beta']);
    });

    it('filters by organization', async () => {
      const context = make_routes_app();
      const { org_a } = await seed_filterable(context);

      expect(ids_in((await get_games(context, { organization_id: org_a })).body)).toEqual([
        'alpha',
      ]);
    });

    it.each([
      ['league', 'metro league', ['alpha']],
      ['level', 'SELECT', ['beta']],
      ['age_group', 'u12', ['alpha']],
      ['location_group', 'algonkian field', ['alpha']],
      ['location_group', 'Location to be announced', ['beta']],
    ])('filters by %s exactly, ignoring case', async (name, value, expected) => {
      const context = make_routes_app();
      await seed_filterable(context);

      const response = await get_games(context, { [name]: value });

      expect(ids_in(response.body)).toEqual(expected);
    });

    it('does not match an exact filter by a partial value', async () => {
      const context = make_routes_app();
      await seed_filterable(context);

      expect(ids_in((await get_games(context, { league: 'metro' })).body)).toEqual([]);
    });

    it('keeps only games with an open position on request', async () => {
      const context = make_routes_app();
      await seed_filterable(context);

      expect(ids_in((await get_games(context, { only_with_open_slots: 'true' })).body)).toEqual([
        'alpha',
      ]);
      expect(ids_in((await get_games(context, { only_with_open_slots: 'false' })).body)).toEqual([
        'alpha',
        'beta',
      ]);
    });

    it('combines search and filters', async () => {
      const context = make_routes_app();
      await seed_filterable(context);

      const response = await get_games(context, { search: 'thunder', connection_id: 'c2' });

      expect(ids_in(response.body)).toEqual([]);
      expect(response.body.data.total).toBe(0);
    });
  });

  describe('grouping', () => {
    it('orders locations alphabetically, dates ascending and times ascending', async () => {
      const context = make_routes_app();
      const now = context.harness.clock();
      const day = (n: number): number => Date.UTC(2026, 9, n);
      const mk = (external_id: string, name: string) => ({
        external_id,
        name,
        address_line: null,
        city: null,
        region: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        time_zone: null,
      });
      const [zulu, alpha] = await context.harness.venues.upsert_venues(
        't1',
        'c1',
        [mk('v-z', 'Zulu Park'), mk('v-a', 'alpha Field')],
        'a',
        1,
      );
      await seed_game(context, 'z_late', {
        venue_id: zulu!.venue_id,
        local_date: day(11),
        start_at: now + 5 * HOUR,
      });
      await seed_game(context, 'z_early_day2', {
        venue_id: zulu!.venue_id,
        local_date: day(12),
        start_at: now + 30 * HOUR,
      });
      await seed_game(context, 'z_early', {
        venue_id: zulu!.venue_id,
        local_date: day(11),
        start_at: now + 2 * HOUR,
      });
      await seed_game(context, 'a_game', {
        venue_id: alpha!.venue_id,
        local_date: day(11),
        start_at: now + 9 * HOUR,
      });
      await seed_game(context, 'nowhere', {
        venue_id: null,
        local_date: day(10),
        start_at: now + HOUR,
      });

      const response = await get_games(context);

      const locations = response.body.data.locations as IApiLocation[];
      expect(locations.map((location) => location.location_label)).toEqual([
        'alpha Field',
        'Zulu Park',
        'Location to be announced',
      ]);
      expect(locations[1]?.dates.map((date) => date.local_date)).toEqual([day(11), day(12)]);
      expect(locations[1]?.dates[0]?.games.map((game) => game.game_id)).toEqual([
        'z_early',
        'z_late',
      ]);
      expect(response.body.data.total).toBe(5);
    });
  });

  describe('validation', () => {
    it.each([
      [{ scope: 'EVERYTHING' }, 'scope'],
      [{ from: 'yesterday' }, 'from'],
      [{ to: '1.5' }, 'to'],
      [{ from: '2000', to: '1000' }, 'to'],
      [{ from: '0', to: String(401 * DAY) }, 'to'],
      [{ search: 'a'.repeat(GAMES_LIST_LIMITS.MAX_SEARCH_LENGTH + 1) }, 'search'],
      [{ connection_id: 'bad id!' }, 'connection_id'],
      [{ only_with_open_slots: 'yes' }, 'only_with_open_slots'],
      [{ include_cancelled: '1' }, 'include_cancelled'],
    ] as [Record<string, string>, string][])(
      'answers 400 VALIDATION_ERROR for %j',
      async (query, path) => {
        const context = make_routes_app();

        const response = await get_games(context, query);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
        expect(
          response.body.violations.map((violation: { path: string }) => violation.path),
        ).toEqual([path]);
      },
    );

    it('rejects unknown parameters', async () => {
      const context = make_routes_app();

      const response = await get_games(context, { colour: 'red' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a repeated parameter', async () => {
      const context = make_routes_app();

      const response = await request(context.app)
        .get('/api/games?search=a&search=b')
        .set(auth(ROUTE_TOKENS.owner_a));

      expect(response.status).toBe(400);
    });

    it('never echoes the rejected value back', async () => {
      const context = make_routes_app();

      const response = await get_games(context, { connection_id: 'secret-value!' });

      expect(JSON.stringify(response.body)).not.toContain('secret-value');
    });
  });

  describe('truncation', () => {
    it('caps the response at 2000 games and says so', async () => {
      const context = make_routes_app();
      const now = context.harness.clock();
      await context.harness.games.save_games(
        Array.from({ length: GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE + 3 }, (_, index) =>
          make_contract_game('t1', `g${String(index).padStart(5, '0')}`, {
            start_at: now + HOUR + index,
            local_date: Date.UTC(2026, 9, 10),
            slots: [],
          }),
        ),
      );

      const response = await get_games(context);

      expect(response.status).toBe(200);
      expect(response.body.data.truncated).toBe(true);
      expect(response.body.data.total).toBe(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE + 3);
      const ids = ids_in(response.body);
      expect(ids).toHaveLength(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE);
      expect(ids[0]).toBe('g00000');
    });

    it('is not truncated below the cap', async () => {
      const context = make_routes_app();
      await seed_game(context, 'g1');

      const response = await get_games(context);

      expect(response.body.data.truncated).toBe(false);
    });
  });

  it('reports a store failure as a 500 without leaking its message', async () => {
    const context = make_routes_app();
    context.harness.games.list_games = async () => {
      throw new Error('database password is hunter2');
    };

    const response = await get_games(context);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });
});
