/** Narrowing a visitor of a quick link may apply; null means the filter is off. */
export interface IPublicGameFilters {
  /** Case-insensitive text matched against teams, league, level, venue and location. */
  search: string | null;
  /** Only games of this level (exact, case-insensitive). */
  level: string | null;
  /** Only games of this league (exact, case-insensitive). */
  league: string | null;
  /** Only games at this resolved location label (exact, case-insensitive). */
  location_group: string | null;
}
