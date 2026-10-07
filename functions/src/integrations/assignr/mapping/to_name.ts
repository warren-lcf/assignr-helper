/**
 * Reads a display name from a value Assignr may send as a plain string or as an
 * embedded object with a `name`.
 * @param value String, object with `name`, or anything else.
 * @returns The trimmed name, or null when none is present.
 */
export function to_name(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null) {
    const name = (value as Record<string, unknown>)['name'];
    if (typeof name === 'string') return name.trim() || null;
  }
  return null;
}
