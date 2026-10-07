import { describe, expect, it } from 'vitest';
import { to_name } from './to_name.js';

describe('to_name', () => {
  it('trims a plain string', () => {
    expect(to_name('  U12 Boys ')).toBe('U12 Boys');
  });

  it('reads name from an embedded object', () => {
    expect(to_name({ id: 3, name: ' Hawks ' })).toBe('Hawks');
  });

  it.each([null, undefined, '', '   ', {}, { name: 5 }, { name: '  ' }, 7])(
    'returns null for %j',
    (value) => {
      expect(to_name(value)).toBeNull();
    },
  );
});
