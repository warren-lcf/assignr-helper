import { describe, expect, it } from 'vitest';
import { group_games } from './group_games.js';
import { IGameListItem } from './game_list_item.model.js';
import { UNKNOWN_LOCATION_LABEL } from './unknown_location_label.constant.js';

const day = (n: number): number => Date.UTC(2026, 5, n);

function make_game(overrides: Partial<IGameListItem> = {}): IGameListItem {
  return {
    game_id: 'g1',
    organization_name: 'Org',
    venue_name: 'Field A',
    location_group: null,
    local_date: day(1),
    start_at: day(1) + 15 * 3_600_000,
    level: null,
    league: null,
    home_team: 'Home',
    away_team: 'Away',
    open_slot_count: 1,
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

describe('group_games', () => {
  it('returns an empty list for no games', () => {
    expect(group_games([])).toEqual([]);
  });

  it('prefers location_group, then venue_name, then the unknown label', () => {
    const result = group_games([
      make_game({ game_id: 'a', location_group: 'Complex', venue_name: 'Field 1' }),
      make_game({ game_id: 'b', location_group: null, venue_name: 'Field 2' }),
      make_game({ game_id: 'c', location_group: null, venue_name: null }),
    ]);

    expect(result.map((l) => l.location_label)).toEqual([
      'Complex',
      'Field 2',
      UNKNOWN_LOCATION_LABEL,
    ]);
  });

  it('sorts locations case-insensitively with unknown last', () => {
    const result = group_games([
      make_game({ game_id: '1', venue_name: null }),
      make_game({ game_id: '2', venue_name: 'zebra park' }),
      make_game({ game_id: '3', venue_name: 'Alpha Field' }),
      make_game({ game_id: '4', venue_name: 'beta field' }),
    ]);

    expect(result.map((l) => l.location_label)).toEqual([
      'Alpha Field',
      'beta field',
      'zebra park',
      UNKNOWN_LOCATION_LABEL,
    ]);
  });

  it('keeps unknown last even when it would sort earlier alphabetically', () => {
    const result = group_games([
      make_game({ game_id: '1', venue_name: 'Zulu' }),
      make_game({ game_id: '2', venue_name: null }),
      make_game({ game_id: '3', venue_name: 'Aardvark' }),
    ]);

    expect(result.map((l) => l.location_label)).toEqual([
      'Aardvark',
      'Zulu',
      UNKNOWN_LOCATION_LABEL,
    ]);
  });

  it('keeps case-variant labels as distinct, deterministically ordered groups', () => {
    const forward = group_games([
      make_game({ game_id: '1', venue_name: 'park' }),
      make_game({ game_id: '2', venue_name: 'Park' }),
    ]);
    const backward = group_games([
      make_game({ game_id: '2', venue_name: 'Park' }),
      make_game({ game_id: '1', venue_name: 'park' }),
    ]);

    expect(forward.map((l) => l.location_label)).toEqual(['Park', 'park']);
    expect(backward.map((l) => l.location_label)).toEqual(['Park', 'park']);
  });

  it('sorts dates ascending with null last', () => {
    const result = group_games([
      make_game({ game_id: '1', local_date: null }),
      make_game({ game_id: '2', local_date: day(3) }),
      make_game({ game_id: '3', local_date: day(2) }),
      make_game({ game_id: '4', local_date: null }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.dates.map((d) => d.local_date)).toEqual([day(2), day(3), null]);
    expect(result[0]?.dates[2]?.games.map((g) => g.game_id)).toEqual(['1', '4']);
  });

  it('sorts games by start time then game id for stable ties', () => {
    const t = day(1) + 3_600_000;
    const result = group_games([
      make_game({ game_id: 'b', start_at: t }),
      make_game({ game_id: 'c', start_at: t - 1000 }),
      make_game({ game_id: 'a', start_at: t }),
      make_game({ game_id: 'a', start_at: t }),
    ]);

    expect(result[0]?.dates[0]?.games.map((g) => g.game_id)).toEqual(['c', 'a', 'a', 'b']);
  });

  it('does not mutate the input array or its items', () => {
    const input = [
      make_game({ game_id: 'b', start_at: 2 }),
      make_game({ game_id: 'a', start_at: 1 }),
    ];
    const snapshot = structuredClone(input);

    group_games(input);

    expect(input).toEqual(snapshot);
  });

  it('is deterministic regardless of input order', () => {
    const games = [
      make_game({ game_id: '1', venue_name: 'B', local_date: day(2), start_at: 5 }),
      make_game({ game_id: '2', venue_name: 'A', local_date: day(1), start_at: 4 }),
      make_game({ game_id: '3', venue_name: 'B', local_date: day(1), start_at: 3 }),
    ];

    expect(group_games([...games].reverse())).toEqual(group_games(games));
  });
});

describe('group_games with extended items', () => {
  it('keeps the extra fields of the items it groups', () => {
    const extended = { ...make_game(), my_position: 'Referee' };

    const result = group_games([extended]);

    expect(result[0]?.dates[0]?.games[0]?.my_position).toBe('Referee');
  });
});
