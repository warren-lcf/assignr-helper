/** Lowest score. */
export const SCORE_MIN = 0;
/** Highest score the backend accepts. */
export const SCORE_MAX = 99;
/** Highest player number the backend accepts. */
export const JERSEY_MAX = 99;
/** Most digits a player number has. */
export const JERSEY_MAX_DIGITS = 2;
/** Earliest minute the card panel offers. */
export const MINUTE_MIN = 1;
/** Latest minute the backend accepts. */
export const MINUTE_MAX = 130;
/** The minutes the card panel offers as one-tap shortcuts. */
export const MINUTE_QUICK_VALUES: readonly number[] = [15, 30, 45, 60, 75, 90];
/** Most cards one report holds; the backend refuses more. */
export const MAX_INCIDENTS = 60;
/** How long the Undo toast stays up after a card is added or removed. */
export const UNDO_TOAST_MS = 6000;
/** How far back the report list looks for games that need a report. */
export const LOOKBACK_DAYS = 7;
/** How far ahead the games query reaches, so a game that has just started is never cut off. */
export const LOOKAHEAD_HOURS = 12;
/** Milliseconds in a minute. */
export const MINUTE_MS = 60_000;
/** Milliseconds in an hour. */
export const HOUR_MS = 3_600_000;
/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;
