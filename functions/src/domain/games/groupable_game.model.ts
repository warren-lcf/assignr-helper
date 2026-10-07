/**
 * The few fields grouping needs. Both the authenticated list's games and the public quick-link
 * games satisfy it, so one grouping routine serves both without widening what either exposes.
 */
export interface IGroupableGame {
  game_id: string;
  venue_name: string | null;
  /** Free-form area label (such as a complex name) that wins over the venue name when grouping. */
  location_group: string | null;
  /** UTC-midnight milliseconds of the venue-local calendar date, when known. */
  local_date: number | null;
  /** Kick-off instant in UTC milliseconds. */
  start_at: number;
}
