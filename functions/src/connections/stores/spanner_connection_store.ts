import { Database } from '@google-cloud/spanner';
import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import {
  parse_json,
  to_nullable_number,
  to_nullable_string,
  to_number,
} from '../../sync/stores/spanner_row_values.js';
import { ConnectionStatus } from '../enums/connection_status.enum.js';
import { IConnection } from '../models/connection.model.js';
import { ISyncOutcome } from '../models/sync_outcome.model.js';
import { IConnectionStore } from '../ports/connection_store.interface.js';

const CONNECTION_COLUMNS =
  'tenant_id, connection_id, provider, status, account_label, external_account_id, ' +
  'secret_ref, scopes_json, last_sync_at, last_error, created_at, created_by, updated_at, updated_by';

/**
 * Spanner `IConnectionStore` over the `integration_connections` table. It uses the Spanner
 * client directly instead of core-server's CRUD helpers to match the sync stores: rows arrive
 * already audit-stamped, and the scheduler's per-connection outcome writes would otherwise
 * produce one audit row per sync attempt.
 */
export class SpannerConnectionStore implements IConnectionStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `integration_connections` table.
   */
  public constructor(private readonly database: Database) {}

  /**
   * Reads one connection, scoped to its tenant.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns The connection, or null when this tenant has none with that id.
   */
  public async get_connection(
    tenant_id: string,
    connection_id: string,
  ): Promise<IConnection | null> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONNECTION_COLUMNS} FROM integration_connections ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id',
      params: { tenant_id, connection_id },
      types: { tenant_id: 'string', connection_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_connection(row) : null;
  }

  /**
   * Lists a tenant's connections.
   * @param tenant_id Owning tenant.
   * @returns Connections ordered by `account_label` (unlabelled last), then `connection_id`.
   */
  public async list_connections(tenant_id: string): Promise<IConnection[]> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONNECTION_COLUMNS} FROM integration_connections ` +
        'WHERE tenant_id = @tenant_id ' +
        'ORDER BY account_label IS NULL, account_label, connection_id',
      params: { tenant_id },
      types: { tenant_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_connection(row));
  }

  /**
   * Lists CONNECTED connections across all tenants, least recently synced first.
   * @param limit Maximum rows; a limit below one (or NaN) returns no rows.
   * @returns Connections ordered by `last_sync_at` ascending with never-synced first, ties by
   *   `tenant_id` then `connection_id`. A row that cannot be read is logged and skipped, so one bad
   *   row never stops the scheduler for every tenant.
   */
  public async list_syncable_connections(limit: number): Promise<IConnection[]> {
    const floored = Math.floor(limit);
    if (!(floored >= 1)) {
      return [];
    }
    const row_limit = Math.min(floored, Number.MAX_SAFE_INTEGER);
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONNECTION_COLUMNS} FROM integration_connections ` +
        'WHERE status = @status ' +
        'ORDER BY last_sync_at IS NOT NULL, last_sync_at, tenant_id, connection_id ' +
        'LIMIT @row_limit',
      params: { status: ConnectionStatus.CONNECTED, row_limit },
      types: { status: 'string', row_limit: 'int64' },
      json: true,
    });
    // This listing spans every tenant, so one unreadable row must not stop the scheduler for
    // everyone: skip it, and log the real error so it gets fixed.
    const readable: IConnection[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      try {
        readable.push(this.to_connection(row));
      } catch (error) {
        console.error('Skipping an unreadable connection row', row['connection_id'], error);
      }
    }
    return readable;
  }

  /**
   * Applies a sync outcome to a connection in one read-write transaction and stamps the update.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @param outcome What to change: `last_sync_at` and `status` only when not null,
   *   `last_error` always (null clears it).
   * @param actor Actor to stamp as `updated_by`.
   * @param now UTC milliseconds for `updated_at`.
   * @returns The updated connection, or null when this tenant has no such connection.
   */
  public async record_sync_outcome(
    tenant_id: string,
    connection_id: string,
    outcome: ISyncOutcome,
    actor: string,
    now: number,
  ): Promise<IConnection | null> {
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql:
          `SELECT ${CONNECTION_COLUMNS} FROM integration_connections ` +
          'WHERE tenant_id = @tenant_id AND connection_id = @connection_id',
        params: { tenant_id, connection_id },
        types: { tenant_id: 'string', connection_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      if (!row) {
        return null;
      }
      const existing = this.to_connection(row);
      const updated: IConnection = {
        ...existing,
        last_sync_at: outcome.last_sync_at !== null ? outcome.last_sync_at : existing.last_sync_at,
        last_error: outcome.last_error,
        status: outcome.status !== null ? outcome.status : existing.status,
        updated_at: now,
        updated_by: actor,
      };
      const changes: Record<string, unknown> = {
        tenant_id,
        connection_id,
        last_error: updated.last_error,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      };
      if (outcome.last_sync_at !== null) {
        changes['last_sync_at'] = updated.last_sync_at;
      }
      if (outcome.status !== null) {
        changes['status'] = updated.status;
      }
      transaction.update('integration_connections', changes);
      return updated;
    });
  }

  /**
   * Inserts or replaces a connection by (`tenant_id`, `connection_id`).
   * @param connection Complete row.
   * @returns Resolves when saved.
   */
  public async save_connection(connection: IConnection): Promise<void> {
    await this.database.table('integration_connections').upsert({
      tenant_id: connection.tenant_id,
      connection_id: connection.connection_id,
      provider: connection.provider,
      status: connection.status,
      account_label: connection.account_label,
      external_account_id: connection.external_account_id,
      secret_ref: connection.secret_ref,
      scopes_json: JSON.stringify(connection.scopes),
      last_sync_at: connection.last_sync_at,
      last_error: connection.last_error,
      created_at: connection.created_at,
      created_by: connection.created_by,
      updated_at: connection.updated_at,
      updated_by: connection.updated_by,
    });
  }

  /**
   * Maps a query row to the stored model. A null or blank `scopes_json` reads as no scopes.
   * @param row Row selected with `CONNECTION_COLUMNS` in JSON mode.
   * @returns The connection.
   * @throws Error naming `scopes_json` when it is not a JSON array of strings.
   */
  private to_connection(row: Record<string, unknown>): IConnection {
    const scopes = parse_json<unknown>(row['scopes_json'], 'scopes_json', []);
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
      throw new Error('Column scopes_json holds JSON that is not an array of strings');
    }
    return {
      tenant_id: String(row['tenant_id']),
      connection_id: String(row['connection_id']),
      provider: String(row['provider']) as IntegrationProvider,
      status: String(row['status']) as ConnectionStatus,
      account_label: to_nullable_string(row['account_label']),
      external_account_id: to_nullable_string(row['external_account_id']),
      secret_ref: to_nullable_string(row['secret_ref']),
      scopes: scopes as string[],
      last_sync_at: to_nullable_number(row['last_sync_at'], 'last_sync_at'),
      last_error: to_nullable_string(row['last_error']),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
