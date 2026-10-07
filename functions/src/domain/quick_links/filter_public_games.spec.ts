import { describe, expect, it } from 'vitest';
import { filter_public_games } from './filter_public_games.js';
import { make_public_game } from './make_public_game.fixture.js';
import { IPublicGameFilters } from './public_game_filters.model.js';

const NO_FILTERS: IPublicGameFilters = {
  search: null,
  level: null,
  league: null,
  location_group: null,
};

const GAMES = [
  make_public_game({
    game_id: 'a',
    level: 'U12',
    league: 'Spring League',
    venue_name: 'Field 1',
    location_group: 'North Complex',
    home_team: 'Hawks',
    away_team: 'Eagles',
  }),
  make_public_game({
    game_id: 'b',
    level: 'u14',
    league: 'Fall League',
    venue_name: 'Field 9',
    location_group: null,
    home_team: 'Lions',
    away_team: 'Bears',
  }),
  make_public_game({ game_id: 'c' }),
];

/**
 * Filters the shared games and returns their ids.
 * @param filters Filters to apply on top of "none".
 * @returns The ids of the games that matched, in order.
 */
function ids(filters: Partial<IPublicGameFilters>): string[] {
  return filter_public_games(GAMES, { ...NO_FILTERS, ...filters }).map((game) => game.game_id);
}

describe('filter_public_games', () => {
  it('keeps everything, in order, when no filter is on', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });

  it('matches level and league exactly, ignoring case and surrounding spaces', () => {
    expect(ids({ level: ' U14 ' })).toEqual(['b']);
    expect(ids({ level: 'U1' })).toEqual([]);
    expect(ids({ league: 'spring league' })).toEqual(['a']);
  });

  it('matches the resolved location label: the group when set, else the venue, else unknown', () => {
    expect(ids({ location_group: 'north complex' })).toEqual(['a']);
    expect(ids({ location_group: 'FIELD 9' })).toEqual(['b']);
    expect(ids({ location_group: 'Location to be announced' })).toEqual(['c']);
    expect(ids({ location_group: 'Field 1' })).toEqual([]);
  });

  it('searches teams, league, level, venue and location, ignoring case', () => {
    expect(ids({ search: 'hawk' })).toEqual(['a']);
    expect(ids({ search: 'BEARS' })).toEqual(['b']);
    expect(ids({ search: 'fall' })).toEqual(['b']);
    expect(ids({ search: 'u1' })).toEqual(['a', 'b']);
    expect(ids({ search: 'field 9' })).toEqual(['b']);
    expect(ids({ search: 'north' })).toEqual(['a']);
  });

  it('ignores a blank search', () => {
    expect(ids({ search: '   ' })).toEqual(['a', 'b', 'c']);
  });

  it('requires every filter to match', () => {
    expect(ids({ level: 'U12', league: 'Fall League' })).toEqual([]);
    expect(ids({ level: 'U12', search: 'eagles' })).toEqual(['a']);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(GAMES);

    filter_public_games(GAMES, { ...NO_FILTERS, search: 'hawk' });

    expect(GAMES).toEqual(before);
  });
});
