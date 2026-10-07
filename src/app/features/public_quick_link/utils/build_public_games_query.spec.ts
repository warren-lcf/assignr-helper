import { DEFAULT_PUBLIC_FILTERS } from '../constants/default_public_filters.constant';
import { build_public_games_query } from './build_public_games_query';

describe('build_public_games_query', () => {
  it('is empty for no filters', () => {
    expect(build_public_games_query(DEFAULT_PUBLIC_FILTERS)).toEqual({});
  });

  it('trims the search and leaves a blank one out', () => {
    expect(build_public_games_query({ ...DEFAULT_PUBLIC_FILTERS, search: '  lions ' })).toEqual({
      search: 'lions',
    });
    expect(build_public_games_query({ ...DEFAULT_PUBLIC_FILTERS, search: '   ' })).toEqual({});
  });

  it('caps the search at 100 characters', () => {
    const query = build_public_games_query({ ...DEFAULT_PUBLIC_FILTERS, search: 'a'.repeat(150) });

    expect(query.search).toHaveLength(100);
  });

  it('includes every facet that is set', () => {
    expect(
      build_public_games_query({
        search: '',
        level: 'Premier',
        league: 'Fall League',
        location_group: 'Riverside Park',
      }),
    ).toEqual({ level: 'Premier', league: 'Fall League', location_group: 'Riverside Park' });
  });
});
