import { to_utc_midnight } from '../../quick_links/utils/to_utc_midnight';
import { from_utc_midnight } from './from_utc_midnight';

describe('from_utc_midnight', () => {
  it('gives the local date on the same calendar day', () => {
    const date = from_utc_midnight(Date.UTC(2026, 9, 10));

    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 10]);
  });

  it('round-trips with to_utc_midnight', () => {
    const utc_ms = Date.UTC(2026, 11, 31);

    expect(to_utc_midnight(from_utc_midnight(utc_ms))).toBe(utc_ms);
  });
});
