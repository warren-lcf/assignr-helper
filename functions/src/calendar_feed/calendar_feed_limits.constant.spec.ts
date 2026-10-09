import { describe, expect, it } from 'vitest';
import { CALENDAR_FEED_LIMITS } from './calendar_feed_limits.constant.js';

describe('CALENDAR_FEED_LIMITS', () => {
  it('reads from 30 days back to 365 days ahead', () => {
    expect(CALENDAR_FEED_LIMITS.LOOKBACK_MS).toBe(30 * 86_400_000);
    expect(CALENDAR_FEED_LIMITS.LOOKAHEAD_MS).toBe(365 * 86_400_000);
  });

  it('caps a feed at 1000 events', () => {
    expect(CALENDAR_FEED_LIMITS.MAX_EVENTS).toBe(1000);
  });

  it('allows shared calendar-provider addresses far more requests than the quick link page, but no more failed guesses', () => {
    const QUICK_LINK_REQUESTS_PER_MINUTE = 60;

    expect(CALENDAR_FEED_LIMITS.REQUESTS_PER_MINUTE_PER_IP).toBeGreaterThanOrEqual(
      10 * QUICK_LINK_REQUESTS_PER_MINUTE,
    );
    expect(CALENDAR_FEED_LIMITS.FAILED_LOOKUPS_PER_MINUTE_PER_IP).toBe(20);
  });
});
