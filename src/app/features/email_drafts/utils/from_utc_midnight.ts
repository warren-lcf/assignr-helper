/**
 * Turns a calendar day stored as UTC-midnight milliseconds into a local
 * `Date` on the same calendar day, which is what a date picker shows. The
 * inverse of `to_utc_midnight`.
 * @param utc_ms UTC milliseconds at 00:00 of the day.
 * @returns A local date on that calendar day.
 */
export function from_utc_midnight(utc_ms: number): Date {
  const date = new Date(utc_ms);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
