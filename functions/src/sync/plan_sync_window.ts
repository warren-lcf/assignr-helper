import { ISyncWindow } from '../integrations/models/sync_window.model.js';

const DAY_MS = 86_400_000;

/** Days before today that stay in the window, so recent results remain visible. */
export const SYNC_WINDOW_PAST_DAYS = 14;

/** Days after today the window reaches. */
export const SYNC_WINDOW_FUTURE_DAYS = 120;

/**
 * Plans the date window a game sync pulls: from the start of the UTC day 14 days
 * ago to the end of the UTC day 120 days ahead.
 * @param now Current instant in UTC milliseconds.
 * @returns The inclusive window.
 */
export function plan_sync_window(now: number): ISyncWindow {
  const start_of_today = Math.floor(now / DAY_MS) * DAY_MS;
  return {
    start_at: start_of_today - SYNC_WINDOW_PAST_DAYS * DAY_MS,
    end_at: start_of_today + (SYNC_WINDOW_FUTURE_DAYS + 1) * DAY_MS - 1,
  };
}
