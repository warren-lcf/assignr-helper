import { IGameListItem } from './game_list_item.model.js';
import { IGroupableGame } from './groupable_game.model.js';

/** Games sharing one venue-local calendar date within a location. */
export interface IGameGroupDate<T extends IGroupableGame = IGameListItem> {
  /** UTC-midnight milliseconds of the calendar date; null when the date is unknown. */
  local_date: number | null;
  /** Games ordered by `start_at`, then `game_id`. */
  games: T[];
}
