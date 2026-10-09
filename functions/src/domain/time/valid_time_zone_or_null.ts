/**
 * Accepts a time zone name only when it is a real IANA zone, so a bad value stored by a provider
 * never reaches a screen or an email.
 * @param time_zone A zone name such as `America/Chicago`, or null.
 * @returns The trimmed name when `Intl` recognises it, otherwise null.
 */
export function valid_time_zone_or_null(time_zone: string | null | undefined): string | null {
  const name = time_zone?.trim();
  if (!name) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return null;
  }
}
