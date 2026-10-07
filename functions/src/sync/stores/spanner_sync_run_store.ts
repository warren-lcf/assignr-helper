import { Database } from '@google-cloud/spanner';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../enums/sync_run_status.enum.js';
import { ISyncRun } from '../models/sync_run.model.js';
import { ISyncRunError } from '../models/sync_run_error.model.js';
import { ISyncRunStore } from '../ports/sync_run_store.interface.js';
import { parse_json, to_nullable_number, to_number } from './spanner_row_values.js';

const SYNC_RUN_COLUMNS =
  'tenant_id, run_id, connection_id, kind, window_start, window_end, status, started_at, ' +
  'finished_at, seen_count, created_count, updated_count, removed_count, ' +
  'rate_limit_remaining, duration_ms, error_json, created_at, created_by, updated_at, updated_by';

/**
 * Spanner `ISyncRunStore` over the `sync_runs` table. It uses the Spanner client directly
 * instead of core-server's CRUD helpers because run rows are already audit-stamped by the
 * engine and per-row audit logging of bulk system sync would be noise.
 */
export class SpannerSyncRunStore implements ISyncRunStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `sync_runs` table.
   */
  public constructor(private readonly database: Database) {}

  /**
   * Inserts or replaces a run by `run_id`.
   * @param run Complete run row.
   * @returns Resolves when saved.
   */
  public async save_run(run: ISyncRun): Promise<void> {
    await this.database.table('sync_runs').upsert({
      tenant_id: run.tenant_id,
      run_id: run.run_id,
      connection_id: run.connection_id,
      kind: run.kind,
      window_start: run.window_start,
      window_end: run.window_end,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      seen_count: run.seen_count,
      created_count: run.created_count,
      updated_count: run.updated_count,
      removed_count: run.removed_count,
      rate_limit_remaining: run.rate_limit_remaining,
      duration_ms: run.duration_ms,
      error_json: run.error === null ? null : JSON.stringify(run.error),
      created_at: run.created_at,
      created_by: run.created_by,
      updated_at: run.updated_at,
      updated_by: run.updated_by,
    });
  }

  /**
   * Finds a run of this kind still marked running that started after `started_after`.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param kind Run kind.
   * @param started_after UTC milliseconds (exclusive); older running rows are treated as abandoned.
   * @returns The newest active run, or null.
   */
  public async find_active_run(
    tenant_id: string,
    connection_id: string,
    kind: SyncKind,
    started_after: number,
  ): Promise<ISyncRun | null> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${SYNC_RUN_COLUMNS} FROM sync_runs@{FORCE_INDEX=sync_runs_by_connection} ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id AND kind = @kind ' +
        'AND status = @status AND started_at > @started_after ' +
        'ORDER BY started_at DESC, run_id LIMIT 1',
      params: { tenant_id, connection_id, kind, status: SyncRunStatus.RUNNING, started_after },
      types: {
        tenant_id: 'string',
        connection_id: 'string',
        kind: 'string',
        status: 'string',
        started_after: 'int64',
      },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_run(row) : null;
  }

  /**
   * Lists a connection's runs, newest first.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param limit Maximum rows; a limit below one returns no rows.
   * @returns Runs ordered by `started_at` descending, ties by `run_id`.
   */
  public async list_runs(
    tenant_id: string,
    connection_id: string,
    limit: number,
  ): Promise<ISyncRun[]> {
    const row_limit = Math.floor(limit);
    if (!(row_limit >= 1)) {
      return [];
    }
    const [rows] = await this.database.run({
      sql:
        `SELECT ${SYNC_RUN_COLUMNS} FROM sync_runs@{FORCE_INDEX=sync_runs_by_connection} ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id ' +
        'ORDER BY started_at DESC, run_id LIMIT @row_limit',
      params: { tenant_id, connection_id, row_limit },
      types: { tenant_id: 'string', connection_id: 'string', row_limit: 'int64' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_run(row));
  }

  /**
   * Maps a query row to the stored model. Count columns are nullable in the table
   * and read as zero.
   * @param row Row selected with `SYNC_RUN_COLUMNS` in JSON mode.
   * @returns The sync run.
   */
  private to_run(row: Record<string, unknown>): ISyncRun {
    return {
      tenant_id: String(row['tenant_id']),
      run_id: String(row['run_id']),
      connection_id: String(row['connection_id']),
      kind: String(row['kind']) as SyncKind,
      window_start: to_nullable_number(row['window_start'], 'window_start'),
      window_end: to_nullable_number(row['window_end'], 'window_end'),
      status: String(row['status']) as SyncRunStatus,
      started_at: to_number(row['started_at'], 'started_at'),
      finished_at: to_nullable_number(row['finished_at'], 'finished_at'),
      seen_count: to_nullable_number(row['seen_count'], 'seen_count') ?? 0,
      created_count: to_nullable_number(row['created_count'], 'created_count') ?? 0,
      updated_count: to_nullable_number(row['updated_count'], 'updated_count') ?? 0,
      removed_count: to_nullable_number(row['removed_count'], 'removed_count') ?? 0,
      rate_limit_remaining: to_nullable_number(row['rate_limit_remaining'], 'rate_limit_remaining'),
      duration_ms: to_nullable_number(row['duration_ms'], 'duration_ms'),
      error: parse_json<ISyncRunError | null>(row['error_json'], 'error_json', null),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
