import { are_public_queries_equal } from './are_public_queries_equal';

describe('are_public_queries_equal', () => {
  it('is true for the same fields, whatever the object identity', () => {
    expect(are_public_queries_equal({ search: 'a', level: 'x' }, { level: 'x', search: 'a' })).toBe(
      true,
    );
    expect(are_public_queries_equal({}, {})).toBe(true);
  });

  it('is false when a value or a field differs', () => {
    expect(are_public_queries_equal({ search: 'a' }, { search: 'b' })).toBe(false);
    expect(are_public_queries_equal({ search: 'a' }, {})).toBe(false);
    expect(are_public_queries_equal({}, { level: 'x' })).toBe(false);
  });
});
