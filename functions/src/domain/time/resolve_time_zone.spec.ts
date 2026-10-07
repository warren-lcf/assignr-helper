import { describe, expect, it } from 'vitest';
import { resolve_time_zone } from './resolve_time_zone.js';

describe('resolve_time_zone', () => {
  it('returns a valid IANA zone unchanged', () => {
    expect(resolve_time_zone('America/New_York')).toBe('America/New_York');
  });

  it('falls back to UTC for null', () => {
    expect(resolve_time_zone(null)).toBe('UTC');
  });

  it('falls back to UTC for blank strings', () => {
    expect(resolve_time_zone('')).toBe('UTC');
    expect(resolve_time_zone('   ')).toBe('UTC');
  });

  it('falls back to UTC for an unknown zone without throwing', () => {
    expect(resolve_time_zone('Mars/Olympus_Mons')).toBe('UTC');
  });
});
