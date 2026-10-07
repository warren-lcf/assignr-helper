import { IGameGroupLocation } from '../games/game_group_location.model.js';
import { IPublicGame } from './public_game.model.js';
import { IPublicGameOptions } from './public_game_options.model.js';

/** What a quick link serves: the visible games, grouped, and the filter options. */
export interface IPublicGamesResult extends IPublicGameOptions {
  /** The instant the games were read, in UTC milliseconds. */
  as_of: number;
  /** Games that matched the visitor's filters, before the per-response cap. */
  total: number;
  /** At most the response cap of games, grouped by location, then date, then time. */
  locations: IGameGroupLocation<IPublicGame>[];
}
