/** Shown where a run has no duration yet. */
const NO_DURATION = '\u2013';

function format_unit(value: number, unit: string, maximum_fraction_digits: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit,
    unitDisplay: 'narrow',
    maximumFractionDigits: maximum_fraction_digits,
  }).format(value);
}

/**
 * Formats a run duration compactly for the viewer's locale: milliseconds under
 * a second, seconds with one decimal under a minute, otherwise minutes and seconds.
 * @param duration_ms Duration in milliseconds, or null while a run is still going.
 * @returns The formatted duration, or an en dash when there is none.
 */
export function format_duration(duration_ms: number | null): string {
  if (duration_ms === null) return NO_DURATION;
  if (duration_ms < 1000) return format_unit(Math.round(duration_ms), 'millisecond', 0);
  if (duration_ms < 60_000) return format_unit(duration_ms / 1000, 'second', 1);
  const minutes = Math.floor(duration_ms / 60_000);
  const seconds = Math.round((duration_ms % 60_000) / 1000);
  return seconds === 0
    ? format_unit(minutes, 'minute', 0)
    : `${format_unit(minutes, 'minute', 0)} ${format_unit(seconds, 'second', 0)}`;
}
