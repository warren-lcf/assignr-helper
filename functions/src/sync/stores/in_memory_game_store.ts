import { GameListScope } from '../enums/game_list_scope.enum.js';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { IGameListQuery } from '../models/game_list_query.model.js';
import { IStoredGame } from '../models/stored_game.model.js';
import { IUnseenGamesQuery } from '../models/unseen_games_query.model.js';
import { IGameStore } from '../ports/game_store.interface.js';

/** In-memory `IGameStore` for tests and local development. Reads and writes are copies. */
export class InMemoryGameStore implements IGameStore {
  private readonly rows = new Map<string, IStoredGame>();

  /**
   * Finds stored games by provider id.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the games belong to.
   * @param external_ids Provider game ids.
   * @returns Copies of the games that exist.
   */
  public async find_by_external_ids(
    tenant_id: string,
    connection_id: string,
    external_ids: string[],
  ): Promise<IStoredGame[]> {
    const wanted = new Set(external_ids);
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.tenant_id === tenant_id &&
          row.connection_id === connection_id &&
          wanted.has(row.external_id),
      )
      .map((row) => structuredClone(row));
  }

  /**
   * Inserts or replaces games by `game_id`, storing copies.
   * @param games Complete rows to persist.
   * @returns Resolves when every row is saved.
   */
  public async save_games(games: IStoredGame[]): Promise<void> {
    for (const game of games) {
      this.rows.set(game.game_id, structuredClone(game));
    }
  }

  /**
   * Finds games a completed run did not see.
   * @param query Selection criteria.
   * @returns Copies of matching games ordered by `start_at` then `game_id`.
   * @throws Error when `query.kind` is not `OPEN_GAMES` or `MY_GAMES`.
   */
  public async find_unseen(query: IUnseenGamesQuery): Promise<IStoredGame[]> {
    if (query.kind !== SyncKind.OPEN_GAMES && query.kind !== SyncKind.MY_GAMES) {
      throw new Error(`find_unseen does not support sync kind ${query.kind}`);
    }
    const organization_ids = query.organization_ids ? new Set(query.organization_ids) : null;
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.tenant_id === query.tenant_id &&
          row.connection_id === query.connection_id &&
          (query.kind === SyncKind.OPEN_GAMES ? row.is_open : row.is_mine) &&
          row.start_at >= query.window_start &&
          row.start_at <= query.window_end &&
          row.last_seen_sync_run_id !== query.seen_run_id &&
          (organization_ids === null || organization_ids.has(row.organization_id)),
      )
      .sort((a, b) => a.start_at - b.start_at || (a.game_id < b.game_id ? -1 : 1))
      .map((row) => structuredClone(row));
  }

  /**
   * Lists a tenant's stored games for display, across all of its connections.
   * @param query Selection criteria.
   * @returns Copies of the games that are not removed and start inside the inclusive window,
   *   ordered by `start_at` then `game_id`.
   */
  public async list_games(query: IGameListQuery): Promise<IStoredGame[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.tenant_id === query.tenant_id &&
          row.removed_at === null &&
          row.start_at >= query.window_start &&
          row.start_at <= query.window_end &&
          (query.scope === GameListScope.OPEN
            ? row.is_open
            : query.scope === GameListScope.MINE
              ? row.is_mine
              : row.is_open || row.is_mine),
      )
      .sort((a, b) => a.start_at - b.start_at || (a.game_id < b.game_id ? -1 : 1))
      .map((row) => structuredClone(row));
  }

  /**
   * Test helper returning every stored game across all tenants.
   * @returns Copies of all rows, in insertion order.
   */
  public all_games(): IStoredGame[] {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }
}
