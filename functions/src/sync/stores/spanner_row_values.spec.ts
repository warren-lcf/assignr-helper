import { describe, expect, it } from 'vitest';
import {
  parse_json,
  to_boolean,
  to_nullable_number,
  to_nullable_string,
  to_number,
} from './spanner_row_values.js';

describe('to_number', () => {
  it.each([
    [5, 5],
    [-1.5, -1.5],
    ['1786234975000', 1786234975000],
    [10n, 10],
    [{ value: '42' }, 42],
    [{ value: 7 }, 7],
  ])('converts %s', (input, expected) => {
    expect(to_number(input, 'col')).toBe(expected);
  });

  it.each([[null], [undefined], ['abc'], [''], [Number.NaN], [{}], [true]])(
    'throws naming the column for %s',
    (input) => {
      expect(() => to_number(input, 'start_at')).toThrow(/start_at/);
    },
  );
});

describe('to_nullable_number', () => {
  it('maps null and undefined to null', () => {
    expect(to_nullable_number(null, 'col')).toBeNull();
    expect(to_nullable_number(undefined, 'col')).toBeNull();
  });

  it('converts present values and throws on garbage', () => {
    expect(to_nullable_number('12', 'col')).toBe(12);
    expect(to_nullable_number(0, 'col')).toBe(0);
    expect(() => to_nullable_number('x', 'end_at')).toThrow(/end_at/);
  });
});

describe('to_nullable_string', () => {
  it('maps null and undefined to null and keeps text, including the empty string', () => {
    expect(to_nullable_string(null)).toBeNull();
    expect(to_nullable_string(undefined)).toBeNull();
    expect(to_nullable_string('x')).toBe('x');
    expect(to_nullable_string('')).toBe('');
  });
});

describe('to_boolean', () => {
  it('returns booleans and rejects everything else', () => {
    expect(to_boolean(true, 'col')).toBe(true);
    expect(to_boolean(false, 'col')).toBe(false);
    expect(() => to_boolean(null, 'is_open')).toThrow(/is_open/);
    expect(() => to_boolean('true', 'is_open')).toThrow(/is_open/);
  });
});

describe('parse_json', () => {
  it('parses JSON text', () => {
    expect(parse_json('{"a":1}', 'raw_json', {})).toEqual({ a: 1 });
    expect(parse_json('[1,2]', 'fees_json', [])).toEqual([1, 2]);
  });

  it('returns the fallback for null, undefined and empty text', () => {
    expect(parse_json(null, 'raw_json', { x: 1 })).toEqual({ x: 1 });
    expect(parse_json(undefined, 'raw_json', null)).toBeNull();
    expect(parse_json('', 'raw_json', [])).toEqual([]);
  });

  it('keeps an explicit JSON null distinct from a missing value', () => {
    expect(parse_json('null', 'error_json', { fallback: true })).toBeNull();
  });

  it('throws naming the column for corrupt JSON', () => {
    expect(() => parse_json('{oops', 'flags_json', {})).toThrow(/flags_json.*corrupt JSON/);
  });

  it('throws naming the column when the cell is not text', () => {
    expect(() => parse_json(5, 'flags_json', {})).toThrow(/flags_json/);
  });
});
