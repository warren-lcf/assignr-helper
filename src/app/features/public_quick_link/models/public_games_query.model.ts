/** The query string of the public games call. Unset filters are left out. */
export interface IPublicGamesQuery {
  /** Search text, trimmed and capped. */
  search?: string;
  /** Level to show. */
  level?: string;
  /** League to show. */
  league?: string;
  /** Location to show. */
  location_group?: string;
}
