import { DEFAULT_GAMES_FILTERS } from '../constants/default_games_filters.constant';
import { GamesFilterKey } from '../enums/games_filter_key.enum';
import { IGamesFilters } from '../models/games_filters.model';
import { remove_games_filter, set_games_filter } from './update_games_filter';

describe('set_games_filter', () => {
  it.each([
    [GamesFilterKey.LEAGUE, 'league'],
    [GamesFilterKey.LEVEL, 'level'],
    [GamesFilterKey.AGE_GROUP, 'age_group'],
    [GamesFilterKey.LOCATION_GROUP, 'location_group'],
  ] as const)('sets the %s facet', (key, field) => {
    expect(set_games_filter(DEFAULT_GAMES_FILTERS, key, 'value')[field]).toBe('value');
  });

  it('treats a blank facet value as "any"', () => {
    const chosen = { ...DEFAULT_GAMES_FILTERS, league: 'Fall League' };

    expect(set_games_filter(chosen, GamesFilterKey.LEAGUE, '').league).toBeNull();
    expect(set_games_filter(chosen, GamesFilterKey.LEAGUE, null).league).toBeNull();
  });

  it('sets the toggles', () => {
    const open = set_games_filter(DEFAULT_GAMES_FILTERS, GamesFilterKey.ONLY_WITH_OPEN_SLOTS, true);
    const cancelled = set_games_filter(open, GamesFilterKey.INCLUDE_CANCELLED, true);

    expect(cancelled.only_with_open_slots).toBe(true);
    expect(cancelled.include_cancelled).toBe(true);
  });

  it('ignores a value of the wrong kind for the key', () => {
    expect(set_games_filter(DEFAULT_GAMES_FILTERS, GamesFilterKey.LEAGUE, true)).toBe(
      DEFAULT_GAMES_FILTERS,
    );
    expect(set_games_filter(DEFAULT_GAMES_FILTERS, GamesFilterKey.INCLUDE_CANCELLED, 'x')).toEqual(
      DEFAULT_GAMES_FILTERS,
    );
  });
});

describe('remove_games_filter', () => {
  it('switches each filter off by its chip key', () => {
    const all = {
      ...DEFAULT_GAMES_FILTERS,
      league: 'a',
      level: 'b',
      age_group: 'c',
      location_group: 'd',
      only_with_open_slots: true,
      include_cancelled: true,
    };
    const cleared = Object.values(GamesFilterKey).reduce<IGamesFilters>(
      (filters, key) => remove_games_filter(filters, key),
      all,
    );

    expect(cleared).toEqual(DEFAULT_GAMES_FILTERS);
  });

  it('leaves the filters alone for an unknown key', () => {
    const filters = { ...DEFAULT_GAMES_FILTERS, league: 'a' };

    expect(remove_games_filter(filters, 'NOPE')).toBe(filters);
  });
});
