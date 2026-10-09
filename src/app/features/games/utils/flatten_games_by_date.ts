import { IGameDateGroup } from '../models/game_date_group.model';
import { IGameLocationGroup } from '../models/game_location_group.model';
import { IGameView } from '../models/game_view.model';

/**
 * Orders two games by kick-off, then by id so equal times stay in a stable order.
 * @param a First game.
 * @param b Second game.
 * @returns Negative, zero or positive ordering value.
 */
function compare_games(a: IGameView, b: IGameView): number {
  if (a.start_at !== b.start_at) return a.start_at - b.start_at;
  if (a.game_id === b.game_id) return 0;
  return a.game_id < b.game_id ? -1 : 1;
}

/**
 * Lays the location groups out as one list by date, ignoring where each game is played. Dates run
 * earliest first with games of unknown date last, and a date's games run by kick-off time.
 * @param locations The grouped games as the server returned them.
 * @returns One group per calendar date, each in start-time order. The input is not changed.
 */
export function flatten_games_by_date(locations: readonly IGameLocationGroup[]): IGameDateGroup[] {
  const by_date = new Map<number | null, IGameView[]>();
  for (const location of locations) {
    for (const date of location.dates) {
      for (const game of date.games) {
        const games = by_date.get(date.local_date) ?? [];
        games.push(game);
        by_date.set(date.local_date, games);
      }
    }
  }
  return [...by_date.entries()]
    .map(([local_date, games]): IGameDateGroup => ({
      local_date,
      games: [...games].sort(compare_games),
    }))
    .sort((a, b) => {
      if (a.local_date === b.local_date) return 0;
      if (a.local_date === null) return 1;
      if (b.local_date === null) return -1;
      return a.local_date - b.local_date;
    });
}
