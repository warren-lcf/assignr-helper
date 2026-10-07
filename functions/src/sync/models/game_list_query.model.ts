import { GameListScope } from '../enums/game_list_scope.enum.js';

/**
 * Selects a tenant's stored games for display, across all of its connections.
 * Games with `removed_at` set are never selected.
 */
export interface IGameListQuery {
  tenant_id: string;
  /** Earliest `start_at` to include, in UTC milliseconds (inclusive). */
  window_start: number;
  /** Latest `start_at` to include, in UTC milliseconds (inclusive). */
  window_end: number;
  scope: GameListScope;
}
