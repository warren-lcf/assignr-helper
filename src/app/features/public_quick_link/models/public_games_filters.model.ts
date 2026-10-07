/** What the visitor has chosen. A null facet means "any". */
export interface IPublicGamesFilters {
  /** Search text; may be blank. */
  search: string;
  /** Chosen level, or null. */
  level: string | null;
  /** Chosen league, or null. */
  league: string | null;
  /** Chosen location, or null. */
  location_group: string | null;
}
