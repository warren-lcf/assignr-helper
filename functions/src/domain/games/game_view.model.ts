import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IGameListItem } from './game_list_item.model.js';

/**
 * A stored game as the games list shows it: provider-neutral, with the venue and
 * organization names resolved and the slots reduced to counts. It extends the grouping
 * item so the view itself is grouped and returned, with no second projection.
 */
export interface IGameView extends IGameListItem {
  /** Our id of the connection the game came from. */
  connection_id: string;
  /** Our id of the assignor organization. */
  organization_id: string;
  /** Provider end instant in UTC milliseconds, when known. */
  end_at: number | null;
  status: GameStatus;
  age_group: string | null;
  game_type: string | null;
  gender: string | null;
  /** True while the game was last seen on an open-games list. */
  is_open: boolean;
  /** True while the game was last seen on the account's own list. */
  is_mine: boolean;
  /** Number of officiating positions, filled or not. */
  total_slot_count: number;
  /** Position the connected account holds on this game, when it holds one. */
  my_position: string | null;
}
