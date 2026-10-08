import { GameStatus } from '../enums/game_status.enum';
import { IGameSlotView } from './game_slot_view.model';

/** One game as `GET /api/games` returns it. Mirrors the backend. */
export interface IGameView {
  game_id: string;
  connection_id: string;
  organization_id: string | null;
  organization_name: string | null;
  venue_name: string | null;
  /** Resolved location label the game is grouped under. */
  location_group: string;
  /** UTC-midnight milliseconds of the venue-local calendar date; null when unknown. */
  local_date: number | null;
  /** Kick-off, UTC milliseconds. */
  start_at: number;
  /** End, UTC milliseconds; null when unknown. */
  end_at: number | null;
  status: GameStatus;
  level: string | null;
  league: string | null;
  age_group: string | null;
  game_type: string | null;
  gender: string | null;
  home_team: string | null;
  away_team: string | null;
  /** True while at least one slot can still be claimed. */
  is_open: boolean;
  /** True when the signed-in referee is assigned. */
  is_mine: boolean;
  open_slot_count: number;
  total_slot_count: number;
  /**
   * Every position in game order, each open, filled or the referee's own. Absent only when the
   * server predates this field, so readers treat a missing list as empty.
   */
  slots?: IGameSlotView[];
  /** The referee's position on this game (e.g. "Center"), when assigned. */
  my_position: string | null;
  /** Fees are not available from the provider; always null. */
  fee_minor: null;
  /** Fees are not available from the provider; always null. */
  currency: null;
}
