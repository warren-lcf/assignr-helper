/** How often the page asks for fresh games while it is visible. */
export const AUTO_REFRESH_INTERVAL_MS = 60_000;

/** How long automatic refreshes pause after "too many requests" when the server gives no Retry-After. */
export const DEFAULT_RATE_LIMIT_PAUSE_MS = 30_000;

/** The longest pause a Retry-After is allowed to impose on automatic refreshes. */
export const MAX_RATE_LIMIT_PAUSE_MS = 300_000;

/** Longest search text sent; matches the signed-in Games screen's limit. */
export const PUBLIC_SEARCH_MAX_LENGTH = 100;

/** How many skeleton cards stand in while the first load runs. */
export const PUBLIC_SKELETON_CARD_COUNT = 2;

/** The location label the server gives games without a resolvable location. */
export const PUBLIC_LOCATION_TO_BE_ANNOUNCED = 'Location to be announced';
