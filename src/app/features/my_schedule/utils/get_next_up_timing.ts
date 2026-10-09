import { IGameView } from '../../games/models/game_view.model';
import { NextUpTiming } from '../enums/next_up_timing.enum';

/**
 * Whether the game is still to come or already under way.
 * @param game The game.
 * @param now The current time, UTC milliseconds.
 * @returns UPCOMING before kick-off, otherwise IN_PROGRESS.
 */
export function get_next_up_timing(game: Pick<IGameView, 'start_at'>, now: number): NextUpTiming {
  return game.start_at > now ? NextUpTiming.UPCOMING : NextUpTiming.IN_PROGRESS;
}
