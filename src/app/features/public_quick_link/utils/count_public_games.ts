import { IPublicGamesResult } from '../models/public_games_result.model';

/**
 * How many games are on screen.
 * @param result The latest answer, or undefined before the first one.
 * @returns The number of games across all locations and dates.
 */
export function count_public_games(result: IPublicGamesResult | undefined): number {
  return (result?.locations ?? []).reduce(
    (total, location) =>
      total + location.dates.reduce((subtotal, date) => subtotal + date.games.length, 0),
    0,
  );
}
