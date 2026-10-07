import { ConnectionStatus } from '../enums/connection_status.enum.js';
import { IConnection } from '../models/connection.model.js';
import { ISyncOutcome } from '../models/sync_outcome.model.js';
import { IConnectionStore } from '../ports/connection_store.interface.js';

/** In-memory `IConnectionStore` for tests and local development. Reads and writes are copies. */
export class InMemoryConnectionStore implements IConnectionStore {
  private readonly rows = new Map<string, IConnection>();

  /**
   * Reads one connection, scoped to its tenant.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns A copy of the connection, or null when this tenant has none with that id.
   */
  public async get_connection(
    tenant_id: string,
    connection_id: string,
  ): Promise<IConnection | null> {
    const row = this.rows.get(this.key_of(tenant_id, connection_id));
    return row ? structuredClone(row) : null;
  }

  /**
   * Lists a tenant's connections.
   * @param tenant_id Owning tenant.
   * @returns Copies ordered by `account_label` (unlabelled last), then `connection_id`.
   */
  public async list_connections(tenant_id: string): Promise<IConnection[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id)
      .sort((a, b) => {
        if (a.account_label !== b.account_label) {
          if (a.account_label === null) {
            return 1;
          }
          if (b.account_label === null) {
            return -1;
          }
          return this.compare_text(a.account_label, b.account_label);
        }
        return this.compare_text(a.connection_id, b.connection_id);
      })
      .map((row) => structuredClone(row));
  }

  /**
   * Lists CONNECTED connections across all tenants, least recently synced first.
   * @param limit Maximum rows; a limit below one (or NaN) returns no rows.
   * @returns Copies ordered by `last_sync_at` ascending with never-synced first, ties by
   *   `tenant_id` then `connection_id`.
   */
  public async list_syncable_connections(limit: number): Promise<IConnection[]> {
    const row_limit = Math.floor(limit);
    if (!(row_limit >= 1)) {
      return [];
    }
    return [...this.rows.values()]
      .filter((row) => row.status === ConnectionStatus.CONNECTED)
      .sort((a, b) => {
        if (a.last_sync_at !== b.last_sync_at) {
          if (a.last_sync_at === null) {
            return -1;
          }
          if (b.last_sync_at === null) {
            return 1;
          }
          return a.last_sync_at - b.last_sync_at;
        }
        return (
          this.compare_text(a.tenant_id, b.tenant_id) ||
          this.compare_text(a.connection_id, b.connection_id)
        );
      })
      .slice(0, row_limit)
      .map((row) => structuredClone(row));
  }

  /**
   * Applies a sync outcome to a connection and stamps the update.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @param outcome What to change: `last_sync_at` and `status` only when not null,
   *   `last_error` always (null clears it).
   * @param actor Actor to stamp as `updated_by`.
   * @param now UTC milliseconds for `updated_at`.
   * @returns A copy of the updated connection, or null when this tenant has no such connection.
   */
  public async record_sync_outcome(
    tenant_id: string,
    connection_id: string,
    outcome: ISyncOutcome,
    actor: string,
    now: number,
  ): Promise<IConnection | null> {
    const key = this.key_of(tenant_id, connection_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return null;
    }
    const updated: IConnection = {
      ...existing,
      last_sync_at: outcome.last_sync_at !== null ? outcome.last_sync_at : existing.last_sync_at,
      last_error: outcome.last_error,
      status: outcome.status !== null ? outcome.status : existing.status,
      updated_at: now,
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return structuredClone(updated);
  }

  /**
   * Inserts or replaces a connection by (`tenant_id`, `connection_id`), storing a copy.
   * @param connection Complete row.
   * @returns Resolves when saved.
   */
  public async save_connection(connection: IConnection): Promise<void> {
    this.rows.set(
      this.key_of(connection.tenant_id, connection.connection_id),
      structuredClone(connection),
    );
  }

  /**
   * Builds the map key of a row.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns A key that cannot collide across the two parts.
   */
  private key_of(tenant_id: string, connection_id: string): string {
    return JSON.stringify([tenant_id, connection_id]);
  }

  /**
   * Compares two strings by code unit, matching the database's binary ordering.
   * @param a First text.
   * @param b Second text.
   * @returns A negative, zero or positive number.
   */
  private compare_text(a: string, b: string): number {
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  }
}
