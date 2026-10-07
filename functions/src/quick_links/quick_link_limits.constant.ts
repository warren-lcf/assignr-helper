const MS_PER_DAY = 86_400_000;

/** Fixed limits of the quick-link API. */
export const QUICK_LINK_LIMITS = {
  /** Most organizations one link's scope may name. */
  MAX_ORGANIZATION_IDS: 50,
  /** Most levels one link's scope may name. */
  MAX_LEVELS: 20,
  /** Longest level text in a scope, after trimming. */
  MAX_LEVEL_LENGTH: 64,
  /** Furthest ahead an expiry may be set, in days. */
  MAX_EXPIRY_DAYS: 400,
  /** Furthest ahead an expiry may be set. */
  MAX_EXPIRY_MS: 400 * MS_PER_DAY,
  /** Latest calendar date a scope may name (2200-01-01 UTC), keeping values well inside safe integers. */
  MAX_SCOPE_DATE: Date.UTC(2200, 0, 1),
  /** Milliseconds in a day, for the UTC-midnight check on scope dates. */
  MS_PER_DAY,
  /** A public view starts this far ahead of now: games already under way are not offered. */
  PUBLIC_LOOKAHEAD_MS: 120 * MS_PER_DAY,
  /** Most games one public response carries; `total` still counts every match. */
  MAX_PUBLIC_GAMES_PER_RESPONSE: 1000,
  /** Longest public `search` text accepted. */
  MAX_PUBLIC_SEARCH_LENGTH: 100,
} as const;
