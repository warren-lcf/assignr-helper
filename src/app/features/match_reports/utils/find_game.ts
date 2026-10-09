import { IGameView } from '../../games/models/game_view.model';
import { IGamesResult } from '../../games/models/games_result.model';

/**
 * Finds one game in a grouped games result.
 * @param result The games the backend returned.
 * @param game_id The game to look for.
 * @returns The game, or null when it is not in the result.
 */
export function find_game(result: IGamesResult, game_id: string): IGameView | null {
  for (const location of result.locations) {
    for (const date of location.dates) {
      const found = date.games.find((game) => game.game_id === game_id);
      if (found) return found;
    }
  }
  return null;
}
