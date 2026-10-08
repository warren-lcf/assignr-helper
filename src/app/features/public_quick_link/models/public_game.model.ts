import { IPublicGameSlot } from './public_game_slot.model';

/**
 * A game as the public page receives it. The server leaves out organizations,
 * assignees and anything internal; fees are always null and never shown.
 */
export interface IPublicGame {
  /** Stable id of the game. */
  game_id: string;
  /** Kick-off, UTC milliseconds. */
  start_at: number;
  /** The game's calendar date, UTC-midnight milliseconds; null when unknown. */
  local_date: number | null;
  /** The field or venue, when known. */
  venue_name: string | null;
  /** The location the game is grouped under, when known. */
  location_group: string | null;
  /** Level, when known. */
  level: string | null;
  /** League, when known. */
  league: string | null;
  /** Home team, when announced. */
  home_team: string | null;
  /** Away team, when announced. */
  away_team: string | null;
  /** How many referee spots are still open. */
  open_slot_count: number;
  /**
   * Every position with whether it is still open. Absent only when the server predates this field,
   * so readers treat a missing list as empty.
   */
  slots?: IPublicGameSlot[];
  /** Always null on the public page. */
  fee_minor: null;
  /** Always null on the public page. */
  currency: null;
}
