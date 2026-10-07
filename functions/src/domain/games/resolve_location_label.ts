import { UNKNOWN_LOCATION_LABEL } from './unknown_location_label.constant.js';

/**
 * Resolves the label a game is grouped and filtered under.
 * @param location_group Free-form area label, which wins when present.
 * @param venue_name Name of the game's venue, when known.
 * @returns `location_group`, else `venue_name`, else the unknown-location label.
 */
export function resolve_location_label(
  location_group: string | null,
  venue_name: string | null,
): string {
  return location_group ?? venue_name ?? UNKNOWN_LOCATION_LABEL;
}
