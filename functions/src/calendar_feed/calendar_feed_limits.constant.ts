const MS_PER_DAY = 86_400_000;

/** Fixed limits and names of the calendar feed. */
export const CALENDAR_FEED_LIMITS = {
  /** The feed starts this far before now, so a game just played still shows. */
  LOOKBACK_MS: 30 * MS_PER_DAY,
  /** The feed reaches this far ahead of now. */
  LOOKAHEAD_MS: 365 * MS_PER_DAY,
  /** Most events one feed carries; the soonest ones win. */
  MAX_EVENTS: 1000,
  /** The calendar's display name in a subscriber's calendar app. */
  CALENDAR_NAME: 'My referee schedule',
  /** The file name offered when the feed is saved rather than subscribed to. */
  FILE_NAME: 'my-schedule.ics',
  /**
   * Requests one client address may make to the public feed per minute. Generous on purpose:
   * calendar providers fetch for many people from shared addresses.
   */
  REQUESTS_PER_MINUTE_PER_IP: 600,
  /** Requests per minute per client address whose token opens nothing, checked before every lookup. */
  FAILED_LOOKUPS_PER_MINUTE_PER_IP: 20,
} as const;

/** Stamped as `created_by` and `updated_by` when a write comes through the library's `set_token`, which carries no user. */
export const CALENDAR_FEED_SYSTEM_ACTOR = 'system:calendar_feed';
