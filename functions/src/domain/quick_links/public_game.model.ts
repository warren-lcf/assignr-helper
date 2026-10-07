/**
 * The only game fields a public quick link may reveal. Deliberately excludes
 * assignees, external ids, organization names and raw provider payloads.
 */
export interface IPublicGame {
  game_id: string;
  start_at: number;
  local_date: number | null;
  venue_name: string | null;
  location_group: string | null;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  fee_minor: number | null;
  currency: string | null;
}
