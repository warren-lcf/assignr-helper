import { GamesScope } from '../enums/games_scope.enum';

/** Where the last chosen scope is remembered, in this browser only. */
export const LAST_SCOPE_STORAGE_KEY = 'assignr-helper.games.scope';

/**
 * Reads the scope the user last chose. Browser storage can be missing or throw
 * (private windows, blocked site data), so any failure means "no preference".
 * @returns The remembered scope, or OPEN.
 */
export function read_last_scope(): GamesScope {
  try {
    const stored = localStorage.getItem(LAST_SCOPE_STORAGE_KEY);
    const known = Object.values(GamesScope).find((scope) => scope === stored);
    return known ?? GamesScope.OPEN;
  } catch {
    return GamesScope.OPEN;
  }
}

/**
 * Remembers the chosen scope. Failure to store is ignored: it is a convenience only.
 * @param scope The scope to remember.
 * @returns Nothing.
 */
export function write_last_scope(scope: GamesScope): void {
  try {
    localStorage.setItem(LAST_SCOPE_STORAGE_KEY, scope);
  } catch {
    // Nothing to do: the screen works without a remembered scope.
  }
}
