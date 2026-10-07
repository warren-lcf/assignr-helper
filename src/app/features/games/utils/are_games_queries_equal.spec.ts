import { GamesScope } from '../enums/games_scope.enum';
import { IGamesQuery } from '../models/games_query.model';
import { are_games_queries_equal } from './are_games_queries_equal';

const QUERY: IGamesQuery = {
  scope: GamesScope.OPEN,
  only_with_open_slots: false,
  include_cancelled: false,
};

describe('are_games_queries_equal', () => {
  it('is true for queries with the same fields, and for two "no request"', () => {
    expect(are_games_queries_equal({ ...QUERY }, { ...QUERY })).toBe(true);
    expect(are_games_queries_equal(undefined, undefined)).toBe(true);
  });

  it('is false when a value, an extra field or the request itself differs', () => {
    expect(are_games_queries_equal(QUERY, { ...QUERY, scope: GamesScope.MINE })).toBe(false);
    expect(are_games_queries_equal(QUERY, { ...QUERY, search: 'x' })).toBe(false);
    expect(are_games_queries_equal({ ...QUERY, search: 'x' }, QUERY)).toBe(false);
    expect(are_games_queries_equal(QUERY, undefined)).toBe(false);
    expect(are_games_queries_equal(undefined, QUERY)).toBe(false);
  });
});
