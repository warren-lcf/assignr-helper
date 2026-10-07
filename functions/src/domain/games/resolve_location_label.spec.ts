import { describe, expect, it } from 'vitest';
import { resolve_location_label } from './resolve_location_label.js';
import { UNKNOWN_LOCATION_LABEL } from './unknown_location_label.constant.js';

describe('resolve_location_label', () => {
  it('prefers the location group over the venue name', () => {
    expect(resolve_location_label('North Complex', 'Field 1')).toBe('North Complex');
  });

  it('falls back to the venue name', () => {
    expect(resolve_location_label(null, 'Field 1')).toBe('Field 1');
  });

  it('falls back to the unknown label', () => {
    expect(resolve_location_label(null, null)).toBe(UNKNOWN_LOCATION_LABEL);
  });
});
