import { IGameListQuery } from '../models/game_list_query.model.js';
import { IStoredGame } from '../models/stored_game.model.js';
import { IUnseenGamesQuery } from '../models/unseen_games_query.model.js';

/** Persistence port for stored games. Every method is scoped by `tenant_id`. */
export interface IGameStore {
  /**
   * Finds stored games by provider id.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the games belong to.
   * @param external_ids Provider game ids.
   * @returns The games that exist; missing ids are simply absent.
   */
  find_by_external_ids(
    tenant_id: string,
    connection_id: string,
    external_ids: string[],
  ): Promise<IStoredGame[]>;

  /**
   * Reads one stored game of a tenant by its id.
   * @param tenant_id Owning tenant.
   * @param game_id Game id.
   * @returns The game with its slots (removed games included), or null when this tenant has none
   *   with that id.
   */
  get_game(tenant_id: string, game_id: string): Promise<IStoredGame | null>;

  /**
   * Inserts or replaces games by `game_id`.
   * @param games Complete rows to persist.
   * @returns Resolves when every row is saved.
   */
  save_games(games: IStoredGame[]): Promise<void>;

  /**
   * Finds games a completed run did not see.
   * @param query Selection criteria.
   * @returns Matching games.
   */
  find_unseen(query: IUnseenGamesQuery): Promise<IStoredGame[]>;

  /**
   * Lists a tenant's stored games for display, across all of its connections.
   * @param query Selection criteria.
   * @returns Matching games that are not removed, ordered by `start_at` then `game_id`,
   *   with slots attached.
   */
  list_games(query: IGameListQuery): Promise<IStoredGame[]>;
}
