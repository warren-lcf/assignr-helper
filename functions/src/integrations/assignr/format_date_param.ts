/**
 * Formats a UTC instant as the `YYYY-MM-DD` date Assignr search filters take.
 * The filter's exact format is undocumented on the game list pages, so this is
 * the one place to adjust after live verification.
 * @param utc_ms UTC milliseconds.
 * @returns The UTC calendar date as `YYYY-MM-DD`.
 */
export function format_date_param(utc_ms: number): string {
  return new Date(utc_ms).toISOString().slice(0, 10);
}
