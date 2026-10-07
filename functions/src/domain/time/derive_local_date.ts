import { resolve_time_zone } from './resolve_time_zone.js';

/**
 * Derives the calendar date an instant falls on in a given IANA time zone.
 * A null or unrecognised zone falls back to UTC rather than throwing.
 * @param utc_ms The instant, in UTC milliseconds (must be a finite number; `Intl` throws a RangeError otherwise).
 * @param time_zone IANA zone name such as `America/New_York`, or null.
 * @returns UTC-midnight milliseconds of the zone-local calendar date.
 */
export function derive_local_date(utc_ms: number, time_zone: string | null): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolve_time_zone(time_zone),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(new Date(utc_ms));
  const read_part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  const date = new Date(0);
  date.setUTCFullYear(read_part('year'), read_part('month') - 1, read_part('day'));
  return date.getTime();
}
