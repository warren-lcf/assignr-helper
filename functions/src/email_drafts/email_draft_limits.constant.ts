const MS_PER_DAY = 86_400_000;

/** Fixed limits of the email draft API. */
export const EMAIL_DRAFT_LIMITS = {
  /** Longest subject line. */
  MAX_SUBJECT_LENGTH: 200,
  /** Longest intro paragraph. */
  MAX_INTRO_LENGTH: 2000,
  /** Longest `search` filter. */
  MAX_SEARCH_LENGTH: 100,
  /** Longest `level` filter, which also bounds the level a quick link can be scoped to. */
  MAX_LEVEL_LENGTH: 64,
  /** Longest `league` and `location_group` filter. */
  MAX_LONG_FILTER_LENGTH: 255,
  /** Longest `age_group` filter. */
  MAX_AGE_GROUP_LENGTH: 128,
  /** Most contacts a SELECTED draft may name. */
  MAX_CONTACT_IDS: 500,
  /** Days a quick link works when the draft does not say. */
  DEFAULT_EXPIRY_DAYS: 14,
  /** Fewest days a quick link may work. */
  MIN_EXPIRY_DAYS: 1,
  /** Most days a quick link may work. */
  MAX_EXPIRY_DAYS: 90,
  /** Most recipients one send may email. */
  MAX_RECIPIENTS_PER_SEND: 100,
  /** Most drafts `GET /api/email_drafts` lists. */
  MAX_LISTED_DRAFTS: 200,
  /** Most games one email lists; the soonest are kept. */
  MAX_DIGEST_GAMES: 200,
  /** How far ahead the games window looks when the draft has no end date. */
  DEFAULT_LOOKAHEAD_MS: 120 * MS_PER_DAY,
  /** Longest games window. */
  MAX_WINDOW_MS: 400 * MS_PER_DAY,
  /** Latest instant a date filter may name (2200-01-01 UTC). */
  MAX_FILTER_DATE: Date.UTC(2200, 0, 1),
  /** Milliseconds in a day. */
  MS_PER_DAY,
  /** Emails sent at the same time during one send. */
  SEND_CONCURRENCY: 5,
  /** Time one send may spend delivering before it stops and leaves the rest to a retry. */
  SEND_TIME_BUDGET_MS: 240_000,
  /** How long a SENDING lock stands before another request may take it over (its sender must have died). */
  SENDING_STALE_AFTER_MS: 600_000,
  /** Times an update re-reads and retries after losing a race. */
  MAX_UPDATE_ATTEMPTS: 3,
} as const;
