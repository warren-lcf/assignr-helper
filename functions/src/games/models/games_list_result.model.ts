import { IGameGroupLocation } from '../../domain/games/game_group_location.model.js';
import { IGameView } from '../../domain/games/game_view.model.js';

/** The games a listing found, grouped by location, then date, then time. */
export interface IGamesListResult {
  locations: IGameGroupLocation<IGameView>[];
  /** Games that matched the request, before the per-response cap. */
  total: number;
  /** True when more than the cap matched; only the earliest games are returned. */
  truncated: boolean;
}
