import { IConnection } from '../models/connection.model.js';
import { ISyncOutcome } from '../models/sync_outcome.model.js';

/** Persistence port for provider connections. */
export interface IConnectionStore {
  /**
   * Reads one connection.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns The connection, or null when this tenant has none with that id.
   */
  get_connection(tenant_id: string, connection_id: string): Promise<IConnection | null>;

  /**
   * Lists a tenant's connections.
   * @param tenant_id Owning tenant.
   * @returns Connections ordered by `account_label` then `connection_id`.
   */
  list_connections(tenant_id: string): Promise<IConnection[]>;

  /**
   * Lists connections eligible for a scheduled sync, across all tenants: status
   * CONNECTED only, least recently synced first (never-synced first).
   * @param limit Maximum rows.
   * @returns Eligible connections.
   */
  list_syncable_connections(limit: number): Promise<IConnection[]>;

  /**
   * Records the result of a sync attempt on the connection.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @param outcome What to change.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds for the audit stamp.
   * @returns The updated connection, or null when it does not exist.
   */
  record_sync_outcome(
    tenant_id: string,
    connection_id: string,
    outcome: ISyncOutcome,
    actor: string,
    now: number,
  ): Promise<IConnection | null>;

  /**
   * Inserts or replaces a connection (used by the connect flow and by tests).
   * @param connection Complete row.
   * @returns Resolves when saved.
   */
  save_connection(connection: IConnection): Promise<void>;
}
