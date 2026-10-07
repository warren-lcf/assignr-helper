import { describe, expect, it } from 'vitest';
import { plan_sync_window } from './plan_sync_window.js';

describe('plan_sync_window', () => {
  it('spans from 14 days ago to the end of day 120 ahead, in UTC', () => {
    const now = Date.UTC(2026, 9, 7, 15, 30, 0);

    const window = plan_sync_window(now);

    expect(window.start_at).toBe(Date.UTC(2026, 8, 23));
    expect(window.end_at).toBe(Date.UTC(2027, 1, 4, 23, 59, 59, 999));
  });

  it('is stable for any instant inside the same UTC day', () => {
    const morning = plan_sync_window(Date.UTC(2026, 9, 7, 0, 0, 0));
    const night = plan_sync_window(Date.UTC(2026, 9, 7, 23, 59, 59));

    expect(morning).toEqual(night);
  });
});
