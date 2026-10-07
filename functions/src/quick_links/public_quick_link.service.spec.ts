import { describe, expect, it, vi } from 'vitest';
import { generate_quick_link_token } from '../domain/quick_links/generate_quick_link_token.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { IPublicGameFilters } from '../domain/quick_links/public_game_filters.model.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { InMemoryGameStore } from '../sync/stores/in_memory_game_store.js';
import { InMemoryVenueStore } from '../sync/stores/in_memory_venue_store.js';
import { IStoredQuickLink } from './models/stored_quick_link.model.js';
import { PublicQuickLinkService } from './public_quick_link.service.js';
import { QUICK_LINK_LIMITS } from './quick_link_limits.constant.js';
import { InMemoryQuickLinkStore } from './stores/in_memory_quick_link_store.js';
import { make_contract_quick_link } from './stores/contracts/make_contract_quick_link.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NO_FILTERS: IPublicGameFilters = {
  search: null,
  level: null,
  league: null,
  location_group: null,
};
const PUBLIC_GAME_KEYS = [
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
  'start_at',
  'venue_name',
];

/**
 * Builds the service over in-memory stores and a fixed clock.
 * @returns The service and the stores a spec seeds.
 */
function make_service() {
  const quick_links = new InMemoryQuickLinkStore();
  const games = new InMemoryGameStore();
  let ids = 0;
  const venues = new InMemoryVenueStore({ generate_id: () => `venue-${++ids}` });
  const clock = { now: NOW };
  const service = new PublicQuickLinkService({
    quick_links,
    games,
    venues,
    now: () => clock.now,
  });
  return { service, quick_links, games, venues, clock };
}

/**
 * Seeds a link whose token is returned.
 * @param quick_links Store to seed.
 * @param overrides Fields of the link to replace.
 * @returns The token and the stored link.
 */
async function seed_link(
  quick_links: InMemoryQuickLinkStore,
  overrides: Partial<IStoredQuickLink> = {},
) {
  const token = generate_quick_link_token();
  const link = make_contract_quick_link('t1', 'l1', {
    token_hash: hash_quick_link_token(token),
    ...overrides,
  });
  await quick_links.create_link(link);
  return { token, link };
}

/**
 * Builds a game that is open, unfilled and starts tomorrow, for tenant `t1`.
 * @param game_id Primary key.
 * @param overrides Fields to replace.
 * @returns The stored game.
 */
function make_game(game_id: string, overrides: Partial<IStoredGame> = {}): IStoredGame {
  return make_contract_game('t1', game_id, {
    start_at: NOW + DAY,
    local_date: Date.UTC(2027, 0, 16),
    ...overrides,
  });
}

describe('PublicQuickLinkService.open_link', () => {
  it('returns the link for its token', async () => {
    const { service, quick_links } = make_service();
    const { token } = await seed_link(quick_links);

    expect(await service.open_link(token)).toMatchObject({ tenant_id: 't1', link_id: 'l1' });
  });

  it('returns null for a token no link has', async () => {
    const { service, quick_links } = make_service();
    await seed_link(quick_links);

    expect(await service.open_link(generate_quick_link_token())).toBeNull();
  });

  it('returns null for a revoked link', async () => {
    const { service, quick_links } = make_service();
    const { token } = await seed_link(quick_links, { revoked_at: NOW - 1 });

    expect(await service.open_link(token)).toBeNull();
  });

  it('returns null from the instant the link expires', async () => {
    const { service, quick_links, clock } = make_service();
    const { token } = await seed_link(quick_links, { expires_at: NOW + 1000 });

    expect(await service.open_link(token)).not.toBeNull();
    clock.now = NOW + 1000;
    expect(await service.open_link(token)).toBeNull();
  });

  it('looks up by the hash of the token, never the token itself', async () => {
    const { service, quick_links } = make_service();
    const { token } = await seed_link(quick_links);
    const find = vi.spyOn(quick_links, 'find_by_token_hash');

    await service.open_link(token);

    expect(find).toHaveBeenCalledWith(hash_quick_link_token(token));
    expect(find).not.toHaveBeenCalledWith(token);
  });

  it('refuses a store answer whose hash does not match, even if the store returned a row', async () => {
    const { service, quick_links } = make_service();
    const { token, link } = await seed_link(quick_links);
    vi.spyOn(quick_links, 'find_by_token_hash').mockResolvedValue({
      ...link,
      token_hash: hash_quick_link_token('some other token'),
    });

    expect(await service.open_link(token)).toBeNull();
  });
});

describe('PublicQuickLinkService.get_games', () => {
  it('serves only allow-listed fields and nothing private', async () => {
    const { service, quick_links, games, venues } = make_service();
    const { link } = await seed_link(quick_links);
    const [venue] = await venues.upsert_venues(
      't1',
      'c1',
      [
        {
          external_id: 'ev1',
          name: 'Field 1',
          address_line: '1 Secret Street',
          city: null,
          region: null,
          postal_code: null,
          latitude: null,
          longitude: null,
          time_zone: null,
        },
      ],
      'sync',
      NOW,
    );
    const game = make_game('g1', {
      venue_id: venue!.venue_id,
      level: 'U12',
      league: 'Spring',
      home_team: 'Hawks',
      away_team: 'Eagles',
      raw: { private: 'payload' },
    });
    game.slots = [
      { ...game.slots[0]!, assignment_external_id: 'a-1', assignee_name: 'Pat Referee' },
      { ...game.slots[0]!, slot_id: 'slot_2', fees: [{ amount: 90 }] },
    ];
    await games.save_games([game]);

    const result = await service.get_games(link, NO_FILTERS);

    const served = result.locations[0]!.dates[0]!.games[0]!;
    expect(Object.keys(served).sort()).toEqual(PUBLIC_GAME_KEYS);
    expect(served).toMatchObject({
      game_id: 'g1',
      venue_name: 'Field 1',
      level: 'U12',
      open_slot_count: 1,
      fee_minor: null,
      currency: null,
    });
    const serialized = JSON.stringify(result);
    for (const secret of ['Pat Referee', 'payload', 'Secret Street', 'ext-g1', 'org-1']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('reports the instant it read and groups by location then date then time', async () => {
    const { service, quick_links, games, venues } = make_service();
    const { link } = await seed_link(quick_links);
    const [north, south] = await venues.upsert_venues(
      't1',
      'c1',
      ['North', 'South'].map((name) => ({
        external_id: name,
        name,
        address_line: null,
        city: null,
        region: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        time_zone: null,
      })),
      'sync',
      NOW,
    );
    await games.save_games([
      make_game('late', { venue_id: south!.venue_id, start_at: NOW + 2 * DAY }),
      make_game('early', { venue_id: north!.venue_id, start_at: NOW + DAY }),
      make_game('nowhere', { venue_id: null, start_at: NOW + HOUR }),
    ]);

    const result = await service.get_games(link, NO_FILTERS);

    expect(result.as_of).toBe(NOW);
    expect(result.total).toBe(3);
    expect(result.locations.map((location) => location.location_label)).toEqual([
      'North',
      'South',
      'Location to be announced',
    ]);
  });

  it('shows only open games with an unfilled slot that have not started and are not cancelled', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links);
    const filled = make_game('filled');
    filled.slots = [{ ...filled.slots[0]!, assignment_external_id: 'a-1' }];
    await games.save_games([
      make_game('ok'),
      filled,
      make_game('not_open', { is_open: false, is_mine: true }),
      make_game('cancelled', { status: GameStatus.CANCELLED }),
      make_game('started', { start_at: NOW - 1 }),
      make_game('removed', { removed_at: NOW - HOUR }),
      make_game('too_far', { start_at: NOW + 121 * DAY }),
      make_contract_game('t2', 'other_tenant', { start_at: NOW + DAY }),
    ]);

    const result = await service.get_games(link, NO_FILTERS);

    expect(result.total).toBe(1);
    expect(result.locations[0]!.dates[0]!.games.map((game) => game.game_id)).toEqual(['ok']);
  });

  it('applies the link scope', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links, {
      scope: {
        organization_ids: ['org-keep'],
        levels: ['U12'],
        date_start: Date.UTC(2027, 0, 16),
        date_end: Date.UTC(2027, 0, 16),
      },
    });
    await games.save_games([
      make_game('keep', { organization_id: 'org-keep', level: 'U12' }),
      make_game('wrong_org', { organization_id: 'org-other', level: 'U12' }),
      make_game('wrong_level', { organization_id: 'org-keep', level: 'U14' }),
      make_game('wrong_day', {
        organization_id: 'org-keep',
        level: 'U12',
        local_date: Date.UTC(2027, 0, 17),
      }),
    ]);

    const result = await service.get_games(link, NO_FILTERS);

    expect(result.locations[0]!.dates[0]!.games.map((game) => game.game_id)).toEqual(['keep']);
    expect(result.levels).toEqual(['U12']);
  });

  it('offers filter options from all visible games and narrows by the visitor filters', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links);
    await games.save_games([
      make_game('a', { level: 'U12', league: 'Spring', home_team: 'Hawks' }),
      make_game('b', { level: 'U14', league: 'Fall', home_team: 'Lions' }),
      make_game('c', { level: 'u12', league: null }),
    ]);

    const result = await service.get_games(link, { ...NO_FILTERS, level: 'u12' });

    expect(result.total).toBe(2);
    expect(result.levels).toEqual(['U12', 'U14']);
    expect(result.leagues).toEqual(['Fall', 'Spring']);
    expect(result.location_groups).toEqual(['Location to be announced']);

    const searched = await service.get_games(link, { ...NO_FILTERS, search: 'lion' });
    expect(searched.locations[0]!.dates[0]!.games.map((game) => game.game_id)).toEqual(['b']);
    expect(searched.levels).toEqual(['U12', 'U14']);
  });

  it('caps the games at 1000 but still counts every match, keeping the soonest', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links);
    const cap = QUICK_LINK_LIMITS.MAX_PUBLIC_GAMES_PER_RESPONSE;
    await games.save_games(
      Array.from({ length: cap + 5 }, (_, i) =>
        make_game(`g${String(i).padStart(4, '0')}`, { start_at: NOW + HOUR + i * 1000 }),
      ),
    );

    const result = await service.get_games(link, NO_FILTERS);

    expect(result.total).toBe(cap + 5);
    const served = result.locations.flatMap((location) =>
      location.dates.flatMap((date) => date.games),
    );
    expect(served).toHaveLength(cap);
    expect(served.at(-1)?.game_id).toBe(`g${String(cap - 1).padStart(4, '0')}`);
  });

  it('records the view with the time and count', async () => {
    const { service, quick_links } = make_service();
    const { link } = await seed_link(quick_links);

    await service.get_games(link, NO_FILTERS);
    await service.get_games(link, NO_FILTERS);

    expect(await quick_links.get_link('t1', 'l1')).toMatchObject({
      view_count: 2,
      last_viewed_at: NOW,
    });
  });

  it('still serves the games and logs the real error when recording the view fails', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, quick_links, games } = make_service();
    const { link, token } = await seed_link(quick_links);
    await games.save_games([make_game('g1')]);
    const failure = new Error('spanner unavailable');
    vi.spyOn(quick_links, 'record_view').mockRejectedValue(failure);

    const result = await service.get_games(link, NO_FILTERS);

    expect(result.total).toBe(1);
    expect(error_spy).toHaveBeenCalledWith(expect.any(String), 'l1', failure);
    expect(JSON.stringify(error_spy.mock.calls)).not.toContain(token);
    error_spy.mockRestore();
  });

  it('does not record a view when the games cannot be read', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links);
    vi.spyOn(games, 'list_games').mockRejectedValue(new Error('down'));

    await expect(service.get_games(link, NO_FILTERS)).rejects.toThrow('down');

    expect((await quick_links.get_link('t1', 'l1'))?.view_count).toBe(0);
  });

  it('reads only the link tenant OPEN games from now to 120 days ahead', async () => {
    const { service, quick_links, games } = make_service();
    const { link } = await seed_link(quick_links);
    const list = vi.spyOn(games, 'list_games');

    await service.get_games(link, NO_FILTERS);

    expect(list).toHaveBeenCalledWith({
      tenant_id: 't1',
      window_start: NOW,
      window_end: NOW + 120 * DAY,
      scope: 'OPEN',
    });
  });
});
