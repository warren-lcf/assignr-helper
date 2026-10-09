import { UNKNOWN_DATE_GROUP_KEY } from '../constants/date_heading.constant';

/**
 * The agenda group key of a calendar date: its UTC-midnight milliseconds as digits, so the same
 * day a year apart is two groups, or a fixed word for games without a date. Never an index.
 * @param local_date UTC-midnight milliseconds of the calendar date, or null when unknown.
 * @returns The stable key.
 */
export function get_agenda_date_key(local_date: number | null): string {
  return local_date === null ? UNKNOWN_DATE_GROUP_KEY : String(local_date);
}
