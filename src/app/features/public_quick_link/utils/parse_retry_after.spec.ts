import { parse_retry_after } from './parse_retry_after';

describe('parse_retry_after', () => {
  it('reads a number of seconds', () => {
    expect(parse_retry_after('30')).toBe(30_000);
    expect(parse_retry_after(' 5 ')).toBe(5_000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.UTC(2026, 9, 7, 12, 0, 0);

    expect(parse_retry_after('Wed, 07 Oct 2026 12:01:00 GMT', now)).toBe(60_000);
  });

  it('never returns a negative wait for a date in the past', () => {
    const now = Date.UTC(2026, 9, 7, 12, 0, 0);

    expect(parse_retry_after('Wed, 07 Oct 2026 11:00:00 GMT', now)).toBe(0);
  });

  it('is null when the header is absent or unreadable', () => {
    expect(parse_retry_after(null)).toBeNull();
    expect(parse_retry_after('soon')).toBeNull();
  });
});
