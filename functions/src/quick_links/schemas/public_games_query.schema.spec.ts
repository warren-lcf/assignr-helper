import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { public_games_query_schema } from './public_games_query.schema.js';

describe('public games query schema', () => {
  it('defaults to no filters', () => {
    expect(parse_with_schema(public_games_query_schema, {})).toEqual({
      ok: true,
      data: { search: null, level: null, league: null, location_group: null },
    });
  });

  it('trims values and treats blank ones as not supplied', () => {
    const result = parse_with_schema(public_games_query_schema, {
      search: '  hawks ',
      level: '  ',
      league: '',
      location_group: ' North ',
    });

    expect(result).toEqual({
      ok: true,
      data: { search: 'hawks', level: null, league: null, location_group: 'North' },
    });
  });

  it('accepts a search of exactly 100 characters and rejects 101', () => {
    expect(parse_with_schema(public_games_query_schema, { search: 'a'.repeat(100) }).ok).toBe(true);
    const long = parse_with_schema(public_games_query_schema, { search: 'a'.repeat(101) });
    expect(long.ok).toBe(false);
  });

  it('rejects unknown, repeated and nested parameters', () => {
    expect(parse_with_schema(public_games_query_schema, { tenant_id: 'x' }).ok).toBe(false);
    expect(parse_with_schema(public_games_query_schema, { level: ['a', 'b'] }).ok).toBe(false);
    expect(parse_with_schema(public_games_query_schema, { league: { $ne: 'x' } }).ok).toBe(false);
  });
});
