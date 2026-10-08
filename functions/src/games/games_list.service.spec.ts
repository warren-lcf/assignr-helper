import { describe, expect, it } from 'vitest';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { INormalizedOrganization } from '../integrations/models/normalized_organization.model.js';
import { INormalizedVenue } from '../integrations/models/normalized_venue.model.js';
import { GameListScope } from '../sync/enums/game_list_scope.enum.js';
import { InMemoryGameStore } from '../sync/stores/in_memory_game_store.js';
import { InMemoryOrganizationStore } from '../sync/stores/in_memory_organization_store.js';
import { InMemoryVenueStore } from '../sync/stores/in_memory_venue_store.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { GamesListService } from './games_list.service.js';
import { GAMES_LIST_LIMITS } from './games_list_limits.constant.js';
import { IGamesListRequest } from './models/games_list_request.model.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

const NO_FILTERS = {
  search: null,
  connection_id: null,
  organization_id: null,
  league: null,
  level: null,
  age_group: null,
  location_group: null,
  only_with_open_slots: false,
  include_cancelled: false,
};

/**
 * Builds a request over a wide window.
 * @param overrides Fields to replace.
 * @returns The request.
 */
function make_request(overrides: Partial<IGamesListRequest> = {}): IGamesListRequest {
  return {
    scope: GameListScope.ALL,
    window_start: 0,
    window_end: NOW * 2,
    filters: NO_FILTERS,
    ...overrides,
  };
}

/**
 * Builds a provider venue.
 * @param external_id Provider id.
 * @param name Venue name.
 * @returns The venue.
 */
function make_venue(external_id: string, name: string): INormalizedVenue {
  return {
    external_id,
    name,
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    time_zone: null,
  };
}

/**
 * Builds a service over fresh in-memory stores.
 * @returns The service and its stores.
 */
function make_service() {
  const games = new InMemoryGameStore();
  const venues = new InMemoryVenueStore({ generate_id: () => 'venue-1' });
  const organizations = new InMemoryOrganizationStore({ generate_id: () => 'org-1' });
  const service = new GamesListService({ games, venues, organizations, now: () => NOW });
  return { service, games, venues, organizations };
}

describe('GamesListService', () => {
  it('exposes a query schema bound to its clock', () => {
    const { service } = make_service();

    const result = service.query_schema.safeParse({});

    expect(result.success && result.data.window_start).toBe(NOW - 3 * HOUR);
  });

  it('returns nothing for a tenant with no games', async () => {
    const { service } = make_service();

    expect(await service.list_games('t1', make_request())).toEqual({
      locations: [],
      total: 0,
      truncated: false,
    });
  });

  it('resolves venue and organization names and groups by location and date', async () => {
    const { service, games, venues, organizations } = make_service();
    const org: INormalizedOrganization = { external_id: '101', name: 'Metro Soccer', flags: {} };
    await organizations.upsert_organizations('t1', 'c1', [org], 'a', 1);
    await venues.upsert_venues('t1', 'c1', [make_venue('v-1', 'Field 1')], 'a', 1);
    await games.save_games([
      make_contract_game('t1', 'g1', {
        organization_id: 'org-1',
        venue_id: 'venue-1',
        start_at: NOW + HOUR,
        local_date: 1000,
      }),
    ]);

    const result = await service.list_games('t1', make_request());

    expect(result.total).toBe(1);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]?.location_label).toBe('Field 1');
    expect(result.locations[0]?.dates[0]?.local_date).toBe(1000);
    expect(result.locations[0]?.dates[0]?.games[0]).toMatchObject({
      game_id: 'g1',
      organization_name: 'Metro Soccer',
      venue_name: 'Field 1',
    });
  });

  it('shows a game whose venue or organization is not stored with unknown names', async () => {
    const { service, games } = make_service();
    await games.save_games([make_contract_game('t1', 'g1', { venue_id: 'missing' })]);

    const result = await service.list_games('t1', make_request());

    expect(result.locations[0]?.dates[0]?.games[0]).toMatchObject({
      venue_name: null,
      organization_name: '',
    });
  });

  it('never reads another tenant', async () => {
    const { service, games, venues } = make_service();
    await venues.upsert_venues('t2', 'c1', [make_venue('v-1', 'Other tenant field')], 'a', 1);
    await games.save_games([
      make_contract_game('t1', 'mine'),
      make_contract_game('t2', 'theirs', { venue_id: 'venue-1' }),
    ]);

    const result = await service.list_games('t1', make_request());

    expect(
      result.locations.flatMap((l) => l.dates.flatMap((d) => d.games)).map((g) => g.game_id),
    ).toEqual(['mine']);
    expect(JSON.stringify(result)).not.toContain('Other tenant field');
  });

  it('passes the scope and window to the store', async () => {
    const { service, games } = make_service();
    await games.save_games([
      make_contract_game('t1', 'open', { is_open: true, is_mine: false, start_at: 10 }),
      make_contract_game('t1', 'mine', { is_open: false, is_mine: true, start_at: 20 }),
      make_contract_game('t1', 'late', { start_at: 500 }),
    ]);

    const result = await service.list_games(
      't1',
      make_request({ scope: GameListScope.MINE, window_start: 0, window_end: 100 }),
    );

    expect(result.locations[0]?.dates[0]?.games.map((g) => g.game_id)).toEqual(['mine']);
  });

  it('applies the filters and counts only matching games in total', async () => {
    const { service, games } = make_service();
    await games.save_games([
      make_contract_game('t1', 'a', { home_team: 'Thunder', start_at: 1 }),
      make_contract_game('t1', 'b', { home_team: 'Lightning', start_at: 2 }),
      make_contract_game('t1', 'c', { home_team: 'Thunder', status: GameStatus.CANCELLED }),
    ]);

    const result = await service.list_games(
      't1',
      make_request({ filters: { ...NO_FILTERS, search: 'thunder' } }),
    );

    expect(result.total).toBe(1);
    expect(result.truncated).toBe(false);
  });

  describe('the per-response cap', () => {
    /**
     * Saves consecutive games.
     * @param count How many games to save.
     * @returns The service.
     */
    async function service_with_games(count: number) {
      const { service, games } = make_service();
      await games.save_games(
        Array.from({ length: count }, (_, index) =>
          make_contract_game('t1', `g${String(index).padStart(5, '0')}`, {
            start_at: 1000 + index,
            slots: [],
          }),
        ),
      );
      return service;
    }

    it('does not truncate at exactly the cap', async () => {
      const service = await service_with_games(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE);

      const result = await service.list_games('t1', make_request());

      expect(result.total).toBe(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE);
      expect(result.truncated).toBe(false);
    });

    it('keeps the earliest games and reports the full count when over the cap', async () => {
      const service = await service_with_games(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE + 5);

      const result = await service.list_games('t1', make_request());

      const returned = result.locations.flatMap((l) => l.dates.flatMap((d) => d.games));
      expect(result.truncated).toBe(true);
      expect(result.total).toBe(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE + 5);
      expect(returned).toHaveLength(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE);
      expect(returned[0]?.game_id).toBe('g00000');
      expect(returned.at(-1)?.game_id).toBe(
        `g${String(GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE - 1).padStart(5, '0')}`,
      );
    });

    it('lets a caller ask for a lower cap and keeps the soonest games', async () => {
      const service = await service_with_games(10);

      const result = await service.list_games('t1', make_request({ max_games: 3 }));

      const returned = result.locations.flatMap((l) => l.dates.flatMap((d) => d.games));
      expect(returned.map((game) => game.game_id)).toEqual(['g00000', 'g00001', 'g00002']);
      expect(result.total).toBe(10);
      expect(result.truncated).toBe(true);
    });
  });
});
