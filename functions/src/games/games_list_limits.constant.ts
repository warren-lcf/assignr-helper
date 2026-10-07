const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Fixed limits and defaults of `GET /api/games`. */
export const GAMES_LIST_LIMITS = {
  /** A default window starts this long before now, so a game that just kicked off still shows. */
  DEFAULT_LOOKBACK_MS: 3 * MS_PER_HOUR,
  /** A default window ends this long after now. */
  DEFAULT_LOOKAHEAD_MS: 120 * MS_PER_DAY,
  /** Longest window a caller may ask for, in days. */
  MAX_WINDOW_DAYS: 400,
  /** Longest window a caller may ask for. */
  MAX_WINDOW_MS: 400 * MS_PER_DAY,
  /** Longest `search` text accepted. */
  MAX_SEARCH_LENGTH: 100,
  /** Most games one response carries; beyond it the response is marked truncated. */
  MAX_GAMES_PER_RESPONSE: 2000,
} as const;
