/**
 * Formats a record count for the viewer's locale (thousands separators).
 * @param count The count.
 * @returns The formatted count.
 */
export function format_count(count: number): string {
  return new Intl.NumberFormat().format(count);
}
