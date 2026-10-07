import { IGameLocationGroup } from '../models/game_location_group.model';
import { IGamesResult } from '../models/games_result.model';

/**
 * Counts the games in one location.
 * @param location The location.
 * @returns The number of games across its dates.
 */
export function count_location_games(location: IGameLocationGroup): number {
  return location.dates.reduce((sum, date) => sum + date.games.length, 0);
}

/**
 * Counts the games a result actually lists (which can be fewer than `total` when truncated).
 * @param result The result, or undefined while nothing has loaded.
 * @returns The number of games in the groups.
 */
export function count_games(result: IGamesResult | undefined): number {
  return (result?.locations ?? []).reduce(
    (sum, location) => sum + count_location_games(location),
    0,
  );
}
