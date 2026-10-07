import { DEFAULT_GAMES_FILTERS } from '../constants/default_games_filters.constant';
import { GamesScope } from '../enums/games_scope.enum';
import { IGamesFilters } from '../models/games_filters.model';
import {
  build_facet_source_query,
  build_games_query,
  has_facet_selection,
} from './build_games_query';

const FILTERS: IGamesFilters = { ...DEFAULT_GAMES_FILTERS };

describe('build_games_query', () => {
  it('sends only the scope and the two toggles for the default filters', () => {
    expect(build_games_query(FILTERS)).toEqual({
      scope: GamesScope.OPEN,
      only_with_open_slots: false,
      include_cancelled: false,
    });
  });

  it('includes search and facets that are set, trimmed', () => {
    const query = build_games_query({
      ...FILTERS,
      scope: GamesScope.ALL,
      search: '  lions ',
      league: 'Fall League',
      level: 'Premier',
      age_group: 'U12',
      location_group: 'Riverside Park',
      only_with_open_slots: true,
      include_cancelled: true,
    });

    expect(query).toEqual({
      scope: 'ALL',
      search: 'lions',
      league: 'Fall League',
      level: 'Premier',
      age_group: 'U12',
      location_group: 'Riverside Park',
      only_with_open_slots: true,
      include_cancelled: true,
    });
  });

  it('leaves out blank search', () => {
    expect(build_games_query({ ...FILTERS, search: '   ' })).not.toHaveProperty('search');
  });

  it('cuts search at the backend limit of 100 characters', () => {
    const query = build_games_query({ ...FILTERS, search: 'a'.repeat(150) });

    expect(query.search).toHaveLength(100);
  });

  it('builds the facet source query without any facet', () => {
    const query = build_facet_source_query({
      ...FILTERS,
      search: 'lions',
      league: 'Fall League',
      level: 'Premier',
      age_group: 'U12',
      location_group: 'Riverside Park',
      include_cancelled: true,
    });

    expect(query).toEqual({
      scope: 'OPEN',
      search: 'lions',
      only_with_open_slots: false,
      include_cancelled: true,
    });
  });
});

describe('has_facet_selection', () => {
  it('is false with no facet, whatever else is set', () => {
    expect(has_facet_selection({ ...FILTERS, search: 'x', include_cancelled: true })).toBe(false);
  });

  it.each(['league', 'level', 'age_group', 'location_group'] as const)(
    'is true when %s is chosen',
    (field) => {
      expect(has_facet_selection({ ...FILTERS, [field]: 'value' })).toBe(true);
    },
  );
});
