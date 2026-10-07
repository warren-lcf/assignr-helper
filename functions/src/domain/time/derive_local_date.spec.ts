import { describe, expect, it } from 'vitest';
import { derive_local_date } from './derive_local_date.js';

const utc_midnight = (year: number, month: number, day: number): number =>
  Date.UTC(year, month - 1, day);

describe('derive_local_date', () => {
  it('returns the UTC date for a UTC zone', () => {
    expect(derive_local_date(Date.UTC(2026, 5, 15, 23, 59), 'UTC')).toBe(utc_midnight(2026, 6, 15));
  });

  it('keeps an evening New York game on the local date even though UTC is already the next day', () => {
    const game = Date.UTC(2026, 5, 16, 1, 30); // 21:30 EDT on June 15
    expect(derive_local_date(game, 'America/New_York')).toBe(utc_midnight(2026, 6, 15));
    expect(derive_local_date(game, 'UTC')).toBe(utc_midnight(2026, 6, 16));
  });

  it('handles the spring-forward boundary in New York', () => {
    // Midnight EST on 2026-03-08 is 05:00Z; the clock jumps at 07:00Z.
    expect(derive_local_date(Date.UTC(2026, 2, 8, 4, 59), 'America/New_York')).toBe(
      utc_midnight(2026, 3, 7),
    );
    expect(derive_local_date(Date.UTC(2026, 2, 8, 5, 0), 'America/New_York')).toBe(
      utc_midnight(2026, 3, 8),
    );
    // 23:30 EDT on the 8th is 03:30Z on the 9th (offset now UTC-4).
    expect(derive_local_date(Date.UTC(2026, 2, 9, 3, 30), 'America/New_York')).toBe(
      utc_midnight(2026, 3, 8),
    );
    expect(derive_local_date(Date.UTC(2026, 2, 9, 4, 0), 'America/New_York')).toBe(
      utc_midnight(2026, 3, 9),
    );
  });

  it('handles the fall-back boundary in New York', () => {
    // Midnight EDT on 2026-11-01 is 04:00Z; the clock falls back at 06:00Z.
    expect(derive_local_date(Date.UTC(2026, 10, 1, 3, 59), 'America/New_York')).toBe(
      utc_midnight(2026, 10, 31),
    );
    expect(derive_local_date(Date.UTC(2026, 10, 1, 4, 0), 'America/New_York')).toBe(
      utc_midnight(2026, 11, 1),
    );
    // Both repeated 01:30 instants (05:30Z EDT and 06:30Z EST) are still Nov 1.
    expect(derive_local_date(Date.UTC(2026, 10, 1, 5, 30), 'America/New_York')).toBe(
      utc_midnight(2026, 11, 1),
    );
    expect(derive_local_date(Date.UTC(2026, 10, 1, 6, 30), 'America/New_York')).toBe(
      utc_midnight(2026, 11, 1),
    );
    // Midnight EST on Nov 2 is 05:00Z.
    expect(derive_local_date(Date.UTC(2026, 10, 2, 4, 59), 'America/New_York')).toBe(
      utc_midnight(2026, 11, 1),
    );
    expect(derive_local_date(Date.UTC(2026, 10, 2, 5, 0), 'America/New_York')).toBe(
      utc_midnight(2026, 11, 2),
    );
  });

  it('moves ahead of UTC for Pacific/Auckland', () => {
    expect(derive_local_date(Date.UTC(2026, 6, 1, 11, 30), 'Pacific/Auckland')).toBe(
      utc_midnight(2026, 7, 1),
    );
    expect(derive_local_date(Date.UTC(2026, 6, 1, 12, 30), 'Pacific/Auckland')).toBe(
      utc_midnight(2026, 7, 2),
    );
  });

  it('falls back to UTC for an invalid zone without throwing', () => {
    const instant = Date.UTC(2026, 5, 16, 1, 30);
    expect(derive_local_date(instant, 'Not/AZone')).toBe(utc_midnight(2026, 6, 16));
  });

  it('falls back to UTC for a null zone', () => {
    const instant = Date.UTC(2026, 5, 16, 1, 30);
    expect(derive_local_date(instant, null)).toBe(utc_midnight(2026, 6, 16));
  });

  it('handles year boundaries', () => {
    expect(derive_local_date(Date.UTC(2027, 0, 1, 3, 0), 'America/Los_Angeles')).toBe(
      utc_midnight(2026, 12, 31),
    );
  });

  it('handles dates before 1970', () => {
    expect(derive_local_date(Date.UTC(1969, 11, 31, 23, 0), 'UTC')).toBe(
      utc_midnight(1969, 12, 31),
    );
  });
});
