/** Fixed limits of the events built for the calendar feed. */
export const CALENDAR_EVENT_LIMITS = {
  /** How long a game lasts in the calendar when the provider gave no end time: 90 minutes. */
  DEFAULT_DURATION_MS: 90 * 60_000,
  /** Longest event title, in characters. */
  MAX_TITLE_LENGTH: 200,
  /** Longest team name or position inside the title, in characters. */
  MAX_TITLE_PART_LENGTH: 80,
  /** Longest location line, in characters. */
  MAX_LOCATION_LENGTH: 300,
  /** Longest value on one description line, in characters. */
  MAX_DESCRIPTION_VALUE_LENGTH: 200,
} as const;
