/** Where the "Group by venue" choice is remembered, in this browser only. */
export const GROUP_BY_VENUE_STORAGE_KEY = 'assignr-helper.games.group_by_venue';

/** The stored text for each choice. */
const STORED_ON = 'on';
const STORED_OFF = 'off';

/**
 * Reads whether the games list should be grouped by venue. Browser storage can be missing or throw
 * (private windows, blocked site data), so any failure, or nothing stored, means "grouped".
 * @returns False only when the user turned grouping off earlier.
 */
export function read_group_by_venue(): boolean {
  try {
    return localStorage.getItem(GROUP_BY_VENUE_STORAGE_KEY) !== STORED_OFF;
  } catch {
    return true;
  }
}

/**
 * Remembers the choice. Failure to store is ignored: it is a convenience only.
 * @param group_by_venue True to group by venue, false for one list by date.
 * @returns Nothing.
 */
export function write_group_by_venue(group_by_venue: boolean): void {
  try {
    localStorage.setItem(GROUP_BY_VENUE_STORAGE_KEY, group_by_venue ? STORED_ON : STORED_OFF);
  } catch {
    // Nothing to do: the screen works without a remembered choice.
  }
}
