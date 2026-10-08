/**
 * Which open games a draft lists. The meaning matches the signed-in games list (scope is always
 * OPEN and cancelled games are never included). Text filters compare ignoring case.
 */
export interface IDraftFilters {
  /** Text matched against teams, league, level, age group, venue, location and organization. */
  search: string | null;
  level: string | null;
  league: string | null;
  age_group: string | null;
  location_group: string | null;
  organization_id: string | null;
  connection_id: string | null;
  only_with_open_slots: boolean;
  /** Earliest kick-off in UTC milliseconds; null starts now. Games already started are never listed. */
  date_from: number | null;
  /** Latest kick-off in UTC milliseconds; null looks 120 days ahead. */
  date_to: number | null;
}
