/** Narrowing applied to game views; every field is optional in effect (null or false means off). */
export interface IGameFilters {
  /** Case-insensitive text matched against teams, league, level, age group, venue, location and organization. */
  search: string | null;
  /** Only games from this connection. */
  connection_id: string | null;
  /** Only games of this organization. */
  organization_id: string | null;
  /** Only games of this league (exact, case-insensitive). */
  league: string | null;
  /** Only games of this level (exact, case-insensitive). */
  level: string | null;
  /** Only games of this age group (exact, case-insensitive). */
  age_group: string | null;
  /** Only games at this resolved location label (exact, case-insensitive). */
  location_group: string | null;
  /** Only games with at least one unfilled position. */
  only_with_open_slots: boolean;
  /** Keep cancelled games, which are dropped by default. */
  include_cancelled: boolean;
}
