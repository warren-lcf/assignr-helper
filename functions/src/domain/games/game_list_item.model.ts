/** One game as shown in the "games available" list and digest email. */
export interface IGameListItem {
  game_id: string;
  organization_name: string;
  venue_name: string | null;
  /** Free-form area label (such as a complex name) that wins over the venue name when grouping. */
  location_group: string | null;
  /** UTC-midnight milliseconds of the venue-local calendar date, when known. */
  local_date: number | null;
  /** Kick-off instant in UTC milliseconds. */
  start_at: number;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  /** Fee in minor currency units (for example cents), when known. */
  fee_minor: number | null;
  /** ISO 4217 currency code for `fee_minor`. */
  currency: string | null;
}
