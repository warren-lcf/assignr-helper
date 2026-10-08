import { IGameFilters } from '../../domain/games/game_filters.model.js';
import { GameListScope } from '../../sync/enums/game_list_scope.enum.js';

/** A validated `GET /api/games` request with every default resolved. */
export interface IGamesListRequest {
  scope: GameListScope;
  /** Earliest start instant to include, in UTC milliseconds. */
  window_start: number;
  /** Latest start instant to include, in UTC milliseconds. */
  window_end: number;
  filters: IGameFilters;
  /** Most games to return, the soonest first. Omitted uses the standard per-response cap. */
  max_games?: number;
}
