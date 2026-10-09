import { MINUTE_MAX, MINUTE_MIN, MINUTE_MS } from '../constants/match_report_limits.constant';

/**
 * The minute a card is most likely shown in: whole minutes since kick-off, kept between the first and
 * the last minute the report accepts. With no known kick-off it is the first minute.
 * @param kickoff_at Kick-off, UTC milliseconds, or null when the game is unknown.
 * @param now The current time, UTC milliseconds.
 * @returns A minute from 1 to 130.
 */
export function compute_default_minute(kickoff_at: number | null, now: number): number {
  if (kickoff_at === null) return MINUTE_MIN;
  const elapsed = Math.floor((now - kickoff_at) / MINUTE_MS);
  return Math.min(MINUTE_MAX, Math.max(MINUTE_MIN, elapsed));
}
