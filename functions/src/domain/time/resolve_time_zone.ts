/** IANA zone used whenever a supplied zone is missing or unrecognised. */
const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Resolves a possibly missing or invalid IANA time zone to a usable one.
 * @param time_zone IANA zone name such as `America/New_York`, or null.
 * @returns The supplied zone when `Intl` accepts it, otherwise `UTC`.
 */
export function resolve_time_zone(time_zone: string | null): string {
  if (time_zone === null || time_zone.trim().length === 0) {
    return FALLBACK_TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: time_zone });
    return time_zone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}
