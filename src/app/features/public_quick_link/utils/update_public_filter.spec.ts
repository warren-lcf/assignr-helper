import { DEFAULT_PUBLIC_FILTERS } from '../constants/default_public_filters.constant';
import { PublicFilterKey } from '../enums/public_filter_key.enum';
import { IPublicGamesFilters } from '../models/public_games_filters.model';
import { remove_public_filter, set_public_filter } from './update_public_filter';

const ALL_SET: IPublicGamesFilters = {
  search: 'lions',
  level: 'Premier',
  league: 'Fall League',
  location_group: 'Riverside Park',
};

describe('set_public_filter', () => {
  it.each([
    [PublicFilterKey.LEVEL, { level: 'Select' }],
    [PublicFilterKey.LEAGUE, { league: 'Select' }],
    [PublicFilterKey.LOCATION_GROUP, { location_group: 'Select' }],
  ])('sets %s', (key, expected) => {
    expect(set_public_filter(DEFAULT_PUBLIC_FILTERS, key, 'Select')).toEqual({
      ...DEFAULT_PUBLIC_FILTERS,
      ...expected,
    });
  });

  it('treats a blank value as "any"', () => {
    expect(set_public_filter(ALL_SET, PublicFilterKey.LEVEL, '').level).toBeNull();
  });

  it('ignores an unknown key', () => {
    expect(set_public_filter(ALL_SET, 'NOPE' as PublicFilterKey, 'x')).toBe(ALL_SET);
  });
});

describe('remove_public_filter', () => {
  it('switches off just the chosen facet, keeping the search', () => {
    expect(remove_public_filter(ALL_SET, PublicFilterKey.LEAGUE)).toEqual({
      ...ALL_SET,
      league: null,
    });
  });

  it('ignores an unknown chip key', () => {
    expect(remove_public_filter(ALL_SET, 'NOPE')).toBe(ALL_SET);
  });
});
