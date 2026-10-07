import { IPublicGamesQuery } from '../models/public_games_query.model';

/**
 * Whether two queries ask the server the same thing, so a query rebuilt with
 * the same content does not trigger a new request.
 * @param a One query.
 * @param b The other.
 * @returns True when both carry the same fields.
 */
export function are_public_queries_equal(a: IPublicGamesQuery, b: IPublicGamesQuery): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof IPublicGamesQuery>;
  return [...keys].every((key) => a[key] === b[key]);
}
