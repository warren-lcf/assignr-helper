import { to_utc_midnight } from './to_utc_midnight';

describe('to_utc_midnight', () => {
  it('keeps the calendar day the picker showed, whatever the local time of day', () => {
    expect(to_utc_midnight(new Date(2026, 9, 10))).toBe(Date.UTC(2026, 9, 10));
    expect(to_utc_midnight(new Date(2026, 9, 10, 23, 59, 59))).toBe(Date.UTC(2026, 9, 10));
    expect(to_utc_midnight(new Date(2026, 9, 10, 0, 0, 1))).toBe(Date.UTC(2026, 9, 10));
  });

  it('handles month and year ends', () => {
    expect(to_utc_midnight(new Date(2026, 11, 31))).toBe(Date.UTC(2026, 11, 31));
    expect(to_utc_midnight(new Date(2027, 0, 1))).toBe(Date.UTC(2027, 0, 1));
  });
});
