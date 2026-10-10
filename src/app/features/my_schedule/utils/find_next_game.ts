import { GameStatus } from '../../games/enums/game_status.enum';
import { IGameView } from '../../games/models/game_view.model';
import { get_game_end } from './get_game_end';

/**
 * The game to put under "Next up": the one with the earliest kick-off among those not yet over.
 * A game that has started but not ended still counts, and cancelled games never do.
 * @param games The referee's games, in any order.
 * @param now The current time, UTC milliseconds.
 * @returns The next game, or null when none is left.
 */
export function find_next_game(games: readonly IGameView[], now: number): IGameView | null {
  let next: IGameView | null = null;
  for (const game of games) {
    if (game.status === GameStatus.CANCELLED || get_game_end(game) <= now) continue;
    if (next === null || game.start_at < next.start_at) next = game;
  }
  return next;
}
