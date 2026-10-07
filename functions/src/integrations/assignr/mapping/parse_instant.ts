/**
 * Parses an ISO 8601 timestamp (with offset) into UTC milliseconds.
 * @param value Timestamp string from the provider.
 * @returns UTC milliseconds, or null when absent or unparseable.
 */
export function parse_instant(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
