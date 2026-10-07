/**
 * The name a link goes by on screen. Links have no title of their own, so the
 * creation time identifies them, in the card heading and in the revoke prompt.
 * @param created_at When the link was created, UTC milliseconds.
 * @param format_date_time Formats UTC milliseconds as a date and time for display.
 * @param translate Translates an English key.
 * @returns For example "Quick link created Oct 5, 2026, 3:04 PM".
 */
export function format_quick_link_label(
  created_at: number,
  format_date_time: (utc_ms: number) => string,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  return translate('Quick link created {{date}}', { date: format_date_time(created_at) });
}
