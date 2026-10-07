/**
 * Reads a `Retry-After` header: either a number of seconds or an HTTP date.
 * @param value The header's value, or null when absent.
 * @param now The current time in UTC milliseconds (for the date form).
 * @returns The wait in milliseconds, or null when the header is absent or unreadable.
 */
export function parse_retry_after(value: string | null, now: number = Date.now()): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
