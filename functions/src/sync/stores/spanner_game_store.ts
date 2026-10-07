import { Database, Snapshot } from '@google-cloud/spanner';
import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { GameListScope } from '../enums/game_list_scope.enum.js';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { IGameListQuery } from '../models/game_list_query.model.js';
import { IStoredGame } from '../models/stored_game.model.js';
import { IStoredGameSlot } from '../models/stored_game_slot.model.js';
import { IUnseenGamesQuery } from '../models/unseen_games_query.model.js';
import { IGameStore } from '../ports/game_store.interface.js';
import { compare_slot_ids } from './compare_slot_ids.js';
import { run_write_transaction } from './run_write_transaction.js';
import {
  parse_json,
  to_boolean,
  to_nullable_number,
  to_nullable_string,
  to_number,
} from './spanner_row_values.js';

/** Games written per transaction, keeping each commit well under Spanner's mutation cap. */
const SAVE_CHUNK_SIZE = 200;

const GAME_COLUMNS =
  'tenant_id, game_id, connection_id, organization_id, external_id, venue_id, start_at, end_at, ' +
  'game_time_zone, local_date, status, published, league, age_group, level, game_type, gender, ' +
  'home_team, away_team, is_open, is_mine, external_updated_at, lock_version, fingerprint, ' +
  'last_seen_sync_run_id, removed_at, raw_json, created_at, created_by, updated_at, updated_by';

const SLOT_COLUMNS =
  'game_id, slot_id, position, assignee_name, assignment_external_id, response_status, ' +
  'is_mine, lock_version, fees_json';

/**
 * Spanner `IGameStore` over the `games` and interleaved `game_slots` tables. It uses the
 * Spanner client directly instead of core-server's CRUD helpers because sync rows arrive
 * already audit-stamped by `merge_stored_game` and per-row audit logging of bulk system
 * sync would be noise.
 */
export class SpannerGameStore implements IGameStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `games` and `game_slots` tables.
   */
  public constructor(private readonly database: Database) {}

  /**
   * Finds stored games by provider id using the unique `games_by_external` index.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the games belong to.
   * @param external_ids Provider game ids.
   * @returns The games that exist, with slots ordered by slot id; missing ids are absent.
   */
  public async find_by_external_ids(
    tenant_id: string,
    connection_id: string,
    external_ids: string[],
  ): Promise<IStoredGame[]> {
    if (external_ids.length === 0) {
      return [];
    }
    return this.read_games_with_slots(
      tenant_id,
      `SELECT ${GAME_COLUMNS} FROM games@{FORCE_INDEX=games_by_external} ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id ' +
        'AND external_id IN UNNEST(@external_ids)',
      { tenant_id, connection_id, external_ids: [...new Set(external_ids)] },
      {
        tenant_id: 'string',
        connection_id: 'string',
        external_ids: { type: 'array', child: 'string' },
      },
    );
  }

  /**
   * Inserts or replaces games by `game_id`. Each game's slots are replaced together with
   * the game row in one transaction, so a reader never sees a game with a mix of old and
   * new slots. When a call repeats a game id the last occurrence wins. Games are written in
   * chunks, so a failure partway through leaves earlier chunks saved.
   * @param games Complete rows to persist.
   * @returns Resolves when every row is saved.
   */
  public async save_games(games: IStoredGame[]): Promise<void> {
    const latest = new Map<string, IStoredGame>();
    for (const game of games) {
      latest.set(JSON.stringify([game.tenant_id, game.game_id]), game);
    }
    const unique_games = [...latest.values()];
    for (let start = 0; start < unique_games.length; start += SAVE_CHUNK_SIZE) {
      await this.save_chunk(unique_games.slice(start, start + SAVE_CHUNK_SIZE));
    }
  }

  /**
   * Finds games a completed run did not see.
   * @param query Selection criteria.
   * @returns Matching games ordered by `start_at` then `game_id`, with slots attached.
   * @throws Error when `query.kind` is not `OPEN_GAMES` or `MY_GAMES`; nothing is queried first.
   */
  public async find_unseen(query: IUnseenGamesQuery): Promise<IStoredGame[]> {
    if (query.kind !== SyncKind.OPEN_GAMES && query.kind !== SyncKind.MY_GAMES) {
      throw new Error(`find_unseen does not support sync kind ${query.kind}`);
    }
    if (query.organization_ids !== null && query.organization_ids.length === 0) {
      return [];
    }
    const params: Record<string, unknown> = {
      tenant_id: query.tenant_id,
      connection_id: query.connection_id,
      window_start: query.window_start,
      window_end: query.window_end,
      seen_run_id: query.seen_run_id,
    };
    const types: Record<string, unknown> = {
      tenant_id: 'string',
      connection_id: 'string',
      window_start: 'int64',
      window_end: 'int64',
      seen_run_id: 'string',
    };
    const flag_column = query.kind === SyncKind.OPEN_GAMES ? 'is_open' : 'is_mine';
    let organization_filter = '';
    if (query.organization_ids !== null) {
      organization_filter = ' AND organization_id IN UNNEST(@organization_ids)';
      params['organization_ids'] = [...new Set(query.organization_ids)];
      types['organization_ids'] = { type: 'array', child: 'string' };
    }
    return this.read_games_with_slots(
      query.tenant_id,
      `SELECT ${GAME_COLUMNS} FROM games ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id ' +
        'AND start_at BETWEEN @window_start AND @window_end ' +
        'AND (last_seen_sync_run_id IS NULL OR last_seen_sync_run_id != @seen_run_id) ' +
        `AND ${flag_column} = TRUE${organization_filter} ORDER BY start_at, game_id`,
      params,
      types,
    );
  }

  /**
   * Lists a tenant's stored games for display, across all of its connections. Reads by the
   * `(tenant_id, game_id)` primary key prefix and filters on `start_at`; the per-tenant
   * history is small enough that no secondary index is needed yet.
   * @param query Selection criteria.
   * @returns Games that are not removed and start inside the inclusive window, ordered by
   *   `start_at` then `game_id`, with slots attached.
   */
  public async list_games(query: IGameListQuery): Promise<IStoredGame[]> {
    return this.read_games_with_slots(
      query.tenant_id,
      `SELECT ${GAME_COLUMNS} FROM games ` +
        'WHERE tenant_id = @tenant_id AND removed_at IS NULL ' +
        `AND start_at BETWEEN @window_start AND @window_end AND ${this.scope_predicate(query.scope)} ` +
        'ORDER BY start_at, game_id',
      {
        tenant_id: query.tenant_id,
        window_start: query.window_start,
        window_end: query.window_end,
      },
      { tenant_id: 'string', window_start: 'int64', window_end: 'int64' },
    );
  }

  /**
   * Builds the SQL condition for a listing scope from fixed fragments only.
   * @param scope Which games to select.
   * @returns A boolean SQL expression over `is_open` and `is_mine`.
   */
  private scope_predicate(scope: GameListScope): string {
    switch (scope) {
      case GameListScope.OPEN:
        return 'is_open = TRUE';
      case GameListScope.MINE:
        return 'is_mine = TRUE';
      case GameListScope.ALL:
        return '(is_open = TRUE OR is_mine = TRUE)';
      default:
        throw new Error(`list_games does not support scope ${String(scope)}`);
    }
  }

  /**
   * Writes one chunk of games and their slots atomically.
   * @param chunk Distinct games to persist.
   * @returns Resolves when the transaction committed.
   */
  private async save_chunk(chunk: IStoredGame[]): Promise<void> {
    const game_ids_by_tenant = new Map<string, string[]>();
    for (const game of chunk) {
      const ids = game_ids_by_tenant.get(game.tenant_id) ?? [];
      ids.push(game.game_id);
      game_ids_by_tenant.set(game.tenant_id, ids);
    }
    const game_rows = chunk.map((game) => this.to_game_mutation(game));
    const slot_rows = chunk.flatMap((game) =>
      game.slots.map((slot) => this.to_slot_mutation(game, slot)),
    );

    await run_write_transaction(this.database, async (transaction) => {
      for (const [tenant_id, game_ids] of game_ids_by_tenant) {
        await transaction.runUpdate({
          sql: 'DELETE FROM game_slots WHERE tenant_id = @tenant_id AND game_id IN UNNEST(@game_ids)',
          params: { tenant_id, game_ids },
          types: { tenant_id: 'string', game_ids: { type: 'array', child: 'string' } },
        });
      }
      transaction.upsert('games', game_rows);
      if (slot_rows.length > 0) {
        transaction.insert('game_slots', slot_rows);
      }
    });
  }

  /**
   * Runs a games query and attaches slots from a second query, both against one snapshot
   * so the two reads agree.
   * @param tenant_id Tenant every returned game belongs to.
   * @param sql Games query selecting `GAME_COLUMNS`.
   * @param params Query parameters.
   * @param types Parameter types.
   * @returns The games in query order, each with slots ordered by slot id.
   */
  private async read_games_with_slots(
    tenant_id: string,
    sql: string,
    params: Record<string, unknown>,
    types: Record<string, unknown>,
  ): Promise<IStoredGame[]> {
    const [snapshot] = await this.database.getSnapshot();
    try {
      const [game_rows] = await snapshot.run({ sql, params, types, json: true });
      const games = (game_rows as Record<string, unknown>[]).map((row) => this.to_game(row));
      if (games.length === 0) {
        return [];
      }
      const slots_by_game = await this.read_slots(
        snapshot,
        tenant_id,
        games.map((game) => game.game_id),
      );
      return games.map((game) => ({ ...game, slots: slots_by_game.get(game.game_id) ?? [] }));
    } finally {
      snapshot.end();
    }
  }

  /**
   * Reads the slots of the given games.
   * @param snapshot Open snapshot to read through.
   * @param tenant_id Owning tenant.
   * @param game_ids Games whose slots to read.
   * @returns Slots grouped by game id, each group ordered by slot id.
   */
  private async read_slots(
    snapshot: Snapshot,
    tenant_id: string,
    game_ids: string[],
  ): Promise<Map<string, IStoredGameSlot[]>> {
    const [slot_rows] = await snapshot.run({
      sql:
        `SELECT ${SLOT_COLUMNS} FROM game_slots ` +
        'WHERE tenant_id = @tenant_id AND game_id IN UNNEST(@game_ids)',
      params: { tenant_id, game_ids },
      types: { tenant_id: 'string', game_ids: { type: 'array', child: 'string' } },
      json: true,
    });
    const grouped = new Map<string, IStoredGameSlot[]>();
    for (const row of slot_rows as Record<string, unknown>[]) {
      const game_id = String(row['game_id']);
      const slots = grouped.get(game_id) ?? [];
      slots.push(this.to_slot(row));
      grouped.set(game_id, slots);
    }
    for (const slots of grouped.values()) {
      slots.sort((a, b) => compare_slot_ids(a.slot_id, b.slot_id));
    }
    return grouped;
  }

  /**
   * Maps a games query row to the stored model without slots.
   * @param row Row selected with `GAME_COLUMNS` in JSON mode.
   * @returns The game with an empty slot list.
   */
  private to_game(row: Record<string, unknown>): IStoredGame {
    return {
      tenant_id: String(row['tenant_id']),
      game_id: String(row['game_id']),
      connection_id: String(row['connection_id']),
      organization_id: String(row['organization_id']),
      external_id: String(row['external_id']),
      venue_id: to_nullable_string(row['venue_id']),
      start_at: to_number(row['start_at'], 'start_at'),
      end_at: to_nullable_number(row['end_at'], 'end_at'),
      game_time_zone: to_nullable_string(row['game_time_zone']),
      local_date: to_nullable_number(row['local_date'], 'local_date'),
      status: String(row['status']) as GameStatus,
      published: to_boolean(row['published'], 'published'),
      league: to_nullable_string(row['league']),
      age_group: to_nullable_string(row['age_group']),
      level: to_nullable_string(row['level']),
      game_type: to_nullable_string(row['game_type']),
      gender: to_nullable_string(row['gender']),
      home_team: to_nullable_string(row['home_team']),
      away_team: to_nullable_string(row['away_team']),
      is_open: to_boolean(row['is_open'], 'is_open'),
      is_mine: to_boolean(row['is_mine'], 'is_mine'),
      external_updated_at: to_nullable_number(row['external_updated_at'], 'external_updated_at'),
      lock_version: to_nullable_number(row['lock_version'], 'lock_version'),
      fingerprint: to_nullable_string(row['fingerprint']) ?? '',
      last_seen_sync_run_id: to_nullable_string(row['last_seen_sync_run_id']) ?? '',
      removed_at: to_nullable_number(row['removed_at'], 'removed_at'),
      raw: parse_json<Record<string, unknown>>(row['raw_json'], 'raw_json', {}),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
      slots: [],
    };
  }

  /**
   * Maps a slot query row to the stored slot model.
   * @param row Row selected with `SLOT_COLUMNS` in JSON mode.
   * @returns The slot.
   */
  private to_slot(row: Record<string, unknown>): IStoredGameSlot {
    return {
      slot_id: String(row['slot_id']),
      position: String(row['position']),
      assignee_name: to_nullable_string(row['assignee_name']),
      assignment_external_id: to_nullable_string(row['assignment_external_id']),
      response_status: String(row['response_status']) as AssignmentResponseStatus,
      is_mine: to_boolean(row['is_mine'], 'is_mine'),
      lock_version: to_nullable_number(row['lock_version'], 'lock_version'),
      fees: parse_json<Record<string, unknown>[]>(row['fees_json'], 'fees_json', []),
    };
  }

  /**
   * Maps a game to a `games` row for a mutation.
   * @param game Complete game; its slots are written separately.
   * @returns Column values keyed by column name.
   */
  private to_game_mutation(game: IStoredGame): Record<string, unknown> {
    return {
      tenant_id: game.tenant_id,
      game_id: game.game_id,
      connection_id: game.connection_id,
      organization_id: game.organization_id,
      external_id: game.external_id,
      venue_id: game.venue_id,
      start_at: game.start_at,
      end_at: game.end_at,
      game_time_zone: game.game_time_zone,
      local_date: game.local_date,
      status: game.status,
      published: game.published,
      league: game.league,
      age_group: game.age_group,
      level: game.level,
      game_type: game.game_type,
      gender: game.gender,
      home_team: game.home_team,
      away_team: game.away_team,
      is_open: game.is_open,
      is_mine: game.is_mine,
      external_updated_at: game.external_updated_at,
      lock_version: game.lock_version,
      fingerprint: game.fingerprint,
      last_seen_sync_run_id: game.last_seen_sync_run_id,
      removed_at: game.removed_at,
      raw_json: JSON.stringify(game.raw),
      created_at: game.created_at,
      created_by: game.created_by,
      updated_at: game.updated_at,
      updated_by: game.updated_by,
    };
  }

  /**
   * Maps a slot to a `game_slots` row; audit columns come from the parent game.
   * @param game Parent game.
   * @param slot Slot to write.
   * @returns Column values keyed by column name.
   */
  private to_slot_mutation(game: IStoredGame, slot: IStoredGameSlot): Record<string, unknown> {
    return {
      tenant_id: game.tenant_id,
      game_id: game.game_id,
      slot_id: slot.slot_id,
      position: slot.position,
      assignee_name: slot.assignee_name,
      assignment_external_id: slot.assignment_external_id,
      response_status: slot.response_status,
      is_mine: slot.is_mine,
      lock_version: slot.lock_version,
      fees_json: JSON.stringify(slot.fees),
      created_at: game.created_at,
      created_by: game.created_by,
      updated_at: game.updated_at,
      updated_by: game.updated_by,
    };
  }
}
