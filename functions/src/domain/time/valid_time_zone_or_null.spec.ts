import { describe, expect, it } from 'vitest';
import { valid_time_zone_or_null } from './valid_time_zone_or_null.js';

describe('valid_time_zone_or_null', () => {
  it('keeps a real IANA zone, trimmed', () => {
    expect(valid_time_zone_or_null(' America/Chicago ')).toBe('America/Chicago');
    expect(valid_time_zone_or_null('UTC')).toBe('UTC');
  });

  it.each([null, undefined, '', '   ', 'Not/AZone', 'Central Time'])(
    'returns null for %j',
    (value) => {
      expect(valid_time_zone_or_null(value)).toBeNull();
    },
  );
});
