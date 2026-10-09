/**
 * The only game fields a public quick link may reveal. Deliberately excludes
 * assignees, external ids, organization names and raw provider payloads.
 */
export interface IPublicGame {
  game_id: string;
  start_at: number;
  local_date: number | null;
  /** IANA zone the game is played in, or null when unknown; lets the page show the venue's clock. */
  time_zone: string | null;
  venue_name: string | null;
  location_group: string | null;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  /** Every position with whether it is still open. Names the position, never who holds it. */
  slots: IPublicGameSlot[];
  fee_minor: number | null;
  currency: string | null;
}

/** One officiating position of a publicly shown game. */
export interface IPublicGameSlot {
  /** The position as the provider names it, such as `Referee` or `Mentor`; may be empty. */
  position: string;
  is_open: boolean;
}
