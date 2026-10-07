import { DEFAULT_GAMES_FILTERS } from '../constants/default_games_filters.constant';
import {
  EMPTY_GAMES_RESULT,
  GAMES_RESULT,
  SATURDAY_DATE,
  make_date_group,
  make_game_view,
  make_games_result,
} from '../mocks/game_view.mock';
import { derive_facet_options } from './derive_facet_options';

describe('derive_facet_options', () => {
  it('lists each facet value once, sorted, from the games', () => {
    const result = make_games_result({
      locations: [
        {
          location_label: 'Riverside Park',
          dates: [
            make_date_group(SATURDAY_DATE, [
              make_game_view({ game_id: 'a', age_group: 'U10', league: 'Spring League' }),
              make_game_view({ game_id: 'b', age_group: 'U9', league: 'Fall League' }),
              make_game_view({ game_id: 'c', age_group: 'U10', league: 'fall league' }),
            ]),
          ],
        },
      ],
    });

    const options = derive_facet_options(result, DEFAULT_GAMES_FILTERS);

    expect(options.age_group).toEqual(['U9', 'U10']);
    expect(options.league).toEqual(['Fall League', 'Spring League']);
    expect(options.level).toEqual(['Premier']);
  });

  it('ignores blank and missing values', () => {
    const options = derive_facet_options(GAMES_RESULT, DEFAULT_GAMES_FILTERS);

    expect(options.league).toEqual(['Fall League']);
    expect(options.age_group).toEqual(['U12', 'U14']);
  });

  it('keeps the backend order of locations, including the placeholder', () => {
    const options = derive_facet_options(GAMES_RESULT, DEFAULT_GAMES_FILTERS);

    expect(options.location_group).toEqual(['Riverside Park', 'Location to be announced']);
  });

  it('keeps a selected value the result no longer offers, once', () => {
    const options = derive_facet_options(GAMES_RESULT, {
      ...DEFAULT_GAMES_FILTERS,
      league: 'Winter League',
      level: 'premier',
      location_group: 'Old Park',
    });

    expect(options.league).toEqual(['Fall League', 'Winter League']);
    expect(options.level).toEqual(['Premier']);
    expect(options.location_group).toContain('Old Park');
  });

  it('offers only the selection while nothing has loaded', () => {
    const options = derive_facet_options(undefined, { ...DEFAULT_GAMES_FILTERS, level: 'Select' });

    expect(options).toEqual({
      league: [],
      level: ['Select'],
      age_group: [],
      location_group: [],
    });
    expect(derive_facet_options(EMPTY_GAMES_RESULT, DEFAULT_GAMES_FILTERS).league).toEqual([]);
  });
});
