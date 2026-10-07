import { IGamesQuery } from '../models/games_query.model';

/**
 * Whether two queries ask the backend the same thing. Used so a computed
 * query that is rebuilt with the same content does not trigger a new request.
 * @param a One query, or undefined when no request should be made.
 * @param b The other.
 * @returns True when both are undefined or carry the same fields.
 */
export function are_games_queries_equal(
  a: IGamesQuery | undefined,
  b: IGamesQuery | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof IGamesQuery>;
  return [...keys].every((key) => a[key] === b[key]);
}
