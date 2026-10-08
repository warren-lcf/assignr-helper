/**
 * The game filters of a draft. The scope is always open games. A field the
 * draft does not use may be absent or null.
 */
export interface IDraftFilters {
  search?: string | null;
  level?: string | null;
  league?: string | null;
  age_group?: string | null;
  location_group?: string | null;
  organization_id?: string | null;
  connection_id?: string | null;
  only_with_open_slots?: boolean;
  /** First calendar day, UTC-midnight milliseconds. */
  date_from?: number | null;
  /** Last calendar day, UTC-midnight milliseconds. */
  date_to?: number | null;
}
