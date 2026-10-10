/** One hour in milliseconds. */
export const HOUR_MS = 3_600_000;
/** One day in milliseconds. */
export const DAY_MS = 86_400_000;

/** How far back the schedule reaches, so a game that has just started is still listed. */
export const SCHEDULE_LOOKBACK_MS = 3 * HOUR_MS;
/** How far ahead the schedule reaches, in days. */
export const SCHEDULE_LOOKAHEAD_DAYS = 120;

/**
 * How long a game is assumed to last when the provider gave no end time. Only used to decide
 * whether a game that has started is still "next up".
 */
export const ASSUMED_GAME_DURATION_MS = 2 * HOUR_MS;

/** How often the screen re-reads the clock, so "Starts in 3 hours" and the next game stay current. */
export const CLOCK_TICK_MS = 60_000;

/** How many skeleton rows stand in while the schedule loads. */
export const SKELETON_ROW_COUNT = 3;

/** Where the empty state sends the referee to find games. */
export const GAMES_URL = '/games';

/** The id the backend's single feed is shown under in the share link manager. */
export const FEED_LINK_ID = 'my-schedule-feed';
/** The share link manager's resource type for the feed. */
export const FEED_RESOURCE_TYPE = 'my_schedule';
