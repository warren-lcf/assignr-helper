import { DEFAULT_GAMES_FILTERS } from '../constants/default_games_filters.constant';
import { GamesFilterKey } from '../enums/games_filter_key.enum';
import { make_translation_service_double } from '../mocks/translation_service.mock';
import { active_filter_chips, has_active_games_filters } from './active_filter_chips';

const translate = make_translation_service_double().translate;

describe('active_filter_chips', () => {
  it('has no chips for the default filters', () => {
    expect(active_filter_chips(DEFAULT_GAMES_FILTERS, translate)).toEqual([]);
  });

  it('has a keyed chip per active filter, in a stable order, but none for search', () => {
    const chips = active_filter_chips(
      {
        ...DEFAULT_GAMES_FILTERS,
        search: 'search has its own field',
        league: 'Fall League',
        level: 'Premier',
        age_group: 'U12',
        location_group: 'Location to be announced',
        only_with_open_slots: true,
        include_cancelled: true,
      },
      translate,
    );

    expect(chips).toEqual([
      { key: GamesFilterKey.LEAGUE, label: 'League: Fall League' },
      { key: GamesFilterKey.LEVEL, label: 'Level: Premier' },
      { key: GamesFilterKey.AGE_GROUP, label: 'Age group: U12' },
      { key: GamesFilterKey.LOCATION_GROUP, label: 'Location: Location to be announced' },
      { key: GamesFilterKey.ONLY_WITH_OPEN_SLOTS, label: 'Only games with open slots' },
      { key: GamesFilterKey.INCLUDE_CANCELLED, label: 'Show cancelled' },
    ]);
  });
});

describe('has_active_games_filters', () => {
  it('is false for the defaults and for blank search', () => {
    expect(has_active_games_filters(DEFAULT_GAMES_FILTERS)).toBe(false);
    expect(has_active_games_filters({ ...DEFAULT_GAMES_FILTERS, search: '  ' })).toBe(false);
  });

  it.each([
    { search: 'lions' },
    { league: 'Fall League' },
    { level: 'Premier' },
    { age_group: 'U12' },
    { location_group: 'Riverside Park' },
    { only_with_open_slots: true },
    { include_cancelled: true },
  ])('is true for %j', (change) => {
    expect(has_active_games_filters({ ...DEFAULT_GAMES_FILTERS, ...change })).toBe(true);
  });
});
