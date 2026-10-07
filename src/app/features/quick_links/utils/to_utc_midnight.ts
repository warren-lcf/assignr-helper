/**
 * Turns a calendar day picked in a date picker (a local `Date`) into the same
 * calendar day at UTC midnight, the form the API stores and compares.
 * @param date The picked day.
 * @returns UTC milliseconds at 00:00 of that day.
 */
export function to_utc_midnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
