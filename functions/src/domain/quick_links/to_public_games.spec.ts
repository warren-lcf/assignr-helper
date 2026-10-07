import { describe, expect, it } from 'vitest';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IQuickLinkGameSource } from './quick_link_game_source.model.js';
import { IQuickLinkScope } from './quick_link_scope.model.js';
import { to_public_games } from './to_public_games.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 1, 12, 0);
const ALL_SCOPE: IQuickLinkScope = {
  organization_ids: [],
  levels: [],
  date_start: null,
  date_end: null,
};

const PUBLIC_KEYS = [
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

function make_game(overrides: Partial<IQuickLinkGameSource> = {}): IQuickLinkGameSource {
  return {
    game_id: 'g1',
    external_id: 'ext-1',
    organization_id: 'org1',
    organization_name: 'Secret Org',
    status: GameStatus.SCHEDULED,
    is_open: true,
    start_at: NOW + DAY,
    local_date: Date.UTC(2026, 5, 2),
    venue_name: 'Field A',
    location_group: 'Complex',
    level: 'U12',
    league: 'Spring',
    home_team: 'Hawks',
    away_team: 'Eagles',
    open_slot_count: 1,
    fee_minor: 5000,
    currency: 'USD',
    assignee_names: ['Pat Referee'],
    raw_json: '{"secret":true}',
    ...overrides,
  };
}

describe('to_public_games', () => {
  it('returns an empty list for no games', () => {
    expect(to_public_games([], ALL_SCOPE, NOW)).toEqual([]);
  });

  it('outputs exactly the allowed keys and strips private data', () => {
    const [game] = to_public_games([make_game()], ALL_SCOPE, NOW);

    expect(Object.keys(game ?? {}).sort()).toEqual(PUBLIC_KEYS);
    const serialised = JSON.stringify(game);
    expect(serialised).not.toContain('Pat Referee');
    expect(serialised).not.toContain('ext-1');
    expect(serialised).not.toContain('secret');
    expect(serialised).not.toContain('Secret Org');
    expect(game).toEqual({
      game_id: 'g1',
      start_at: NOW + DAY,
      local_date: Date.UTC(2026, 5, 2),
      venue_name: 'Field A',
      location_group: 'Complex',
      level: 'U12',
      league: 'Spring',
      home_team: 'Hawks',
      away_team: 'Eagles',
      open_slot_count: 1,
      fee_minor: 5000,
      currency: 'USD',
    });
  });

  it('keeps only open games with unfilled slots', () => {
    const result = to_public_games(
      [
        make_game({ game_id: 'open' }),
        make_game({ game_id: 'closed', is_open: false }),
        make_game({ game_id: 'no_slots', open_slot_count: 0 }),
      ],
      ALL_SCOPE,
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['open']);
  });

  it('drops cancelled games', () => {
    const result = to_public_games(
      [make_game({ game_id: 'x', status: GameStatus.CANCELLED }), make_game({ game_id: 'ok' })],
      ALL_SCOPE,
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['ok']);
  });

  it('drops games that have already started or start exactly now', () => {
    const result = to_public_games(
      [
        make_game({ game_id: 'past', start_at: NOW - 1 }),
        make_game({ game_id: 'now', start_at: NOW }),
        make_game({ game_id: 'future', start_at: NOW + 1 }),
      ],
      ALL_SCOPE,
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['future']);
  });

  it('filters by organization when the scope lists organizations', () => {
    const result = to_public_games(
      [
        make_game({ game_id: 'a', organization_id: 'org1' }),
        make_game({ game_id: 'b', organization_id: 'org2' }),
      ],
      { ...ALL_SCOPE, organization_ids: ['org2'] },
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['b']);
  });

  it('filters by level and excludes games without a level when levels are restricted', () => {
    const result = to_public_games(
      [
        make_game({ game_id: 'u12', level: 'U12' }),
        make_game({ game_id: 'u14', level: 'U14' }),
        make_game({ game_id: 'none', level: null }),
      ],
      { ...ALL_SCOPE, levels: ['U12'] },
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['u12']);
  });

  it('applies an inclusive date window using local_date', () => {
    const d = (n: number): number => Date.UTC(2026, 5, n);
    const games = [1, 2, 3, 4, 5].map((n) =>
      make_game({ game_id: `d${n}`, local_date: d(n), start_at: NOW + n * DAY }),
    );

    const result = to_public_games(games, { ...ALL_SCOPE, date_start: d(2), date_end: d(4) }, NOW);

    expect(result.map((g) => g.game_id)).toEqual(['d2', 'd3', 'd4']);
  });

  it('supports an open-ended window on either side', () => {
    const d = (n: number): number => Date.UTC(2026, 5, n);
    const games = [2, 3, 4].map((n) =>
      make_game({ game_id: `d${n}`, local_date: d(n), start_at: NOW + n * DAY }),
    );

    expect(
      to_public_games(games, { ...ALL_SCOPE, date_start: d(3) }, NOW).map((g) => g.game_id),
    ).toEqual(['d3', 'd4']);
    expect(
      to_public_games(games, { ...ALL_SCOPE, date_end: d(3) }, NOW).map((g) => g.game_id),
    ).toEqual(['d2', 'd3']);
  });

  it('falls back to the UTC date of start_at when local_date is unknown', () => {
    const start_at = Date.UTC(2026, 5, 3, 23, 0);
    const inside = make_game({ game_id: 'in', local_date: null, start_at });
    const outside = make_game({
      game_id: 'out',
      local_date: null,
      start_at: Date.UTC(2026, 5, 5, 1, 0),
    });

    const result = to_public_games(
      [inside, outside],
      { ...ALL_SCOPE, date_start: Date.UTC(2026, 5, 3), date_end: Date.UTC(2026, 5, 3) },
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['in']);
  });

  it('falls back correctly for negative start instants', () => {
    const result = to_public_games(
      [make_game({ game_id: 'old', local_date: null, start_at: -1 })],
      { ...ALL_SCOPE, date_start: -DAY, date_end: -DAY },
      -2,
    );

    expect(result.map((g) => g.game_id)).toEqual(['old']);
  });

  it('sorts by start_at then game_id', () => {
    const t = NOW + DAY;
    const result = to_public_games(
      [
        make_game({ game_id: 'b', start_at: t }),
        make_game({ game_id: 'c', start_at: t - 5 }),
        make_game({ game_id: 'a', start_at: t }),
        make_game({ game_id: 'a', start_at: t }),
      ],
      ALL_SCOPE,
      NOW,
    );

    expect(result.map((g) => g.game_id)).toEqual(['c', 'a', 'a', 'b']);
  });

  it('does not mutate its inputs', () => {
    const games = [
      make_game({ game_id: 'b', start_at: NOW + 2 }),
      make_game({ game_id: 'a', start_at: NOW + 1 }),
    ];
    const snapshot = structuredClone(games);

    to_public_games(games, ALL_SCOPE, NOW);

    expect(games).toEqual(snapshot);
  });
});
