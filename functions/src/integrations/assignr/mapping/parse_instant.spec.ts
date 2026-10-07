import { describe, expect, it } from 'vitest';
import { parse_instant } from './parse_instant.js';

describe('parse_instant', () => {
  it('converts an offset timestamp to UTC milliseconds', () => {
    expect(parse_instant('2023-04-03T09:00:00.000-04:00')).toBe(Date.UTC(2023, 3, 3, 13, 0, 0));
  });

  it.each([null, undefined, '', '  ', 'not a date', 42])('returns null for %j', (value) => {
    expect(parse_instant(value)).toBeNull();
  });
});
