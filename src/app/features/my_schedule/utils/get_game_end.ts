import { IGameView } from '../../games/models/game_view.model';
import { ASSUMED_GAME_DURATION_MS } from '../constants/my_schedule.constant';

/**
 * When a game is over: its end time, or kick-off plus an assumed length when the provider gave none.
 * @param game The game.
 * @returns The end, UTC milliseconds.
 */
export function get_game_end(game: Pick<IGameView, 'start_at' | 'end_at'>): number {
  return game.end_at ?? game.start_at + ASSUMED_GAME_DURATION_MS;
}
