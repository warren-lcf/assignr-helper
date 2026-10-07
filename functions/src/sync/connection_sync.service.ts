import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { ConnectionNotFoundError } from '../connections/errors/connection_not_found.error.js';
import { ConnectionNotSyncableError } from '../connections/errors/connection_not_syncable.error.js';
import { IConnectionStore } from '../connections/ports/connection_store.interface.js';
import { derive_connection_outcome } from './derive_connection_outcome.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { IScheduledSyncSummary } from './models/scheduled_sync_summary.model.js';
import { ISyncDeps } from './models/sync_deps.model.js';
import { ISyncRun } from './models/sync_run.model.js';
import { ISyncStores } from './models/sync_stores.model.js';
import { IProviderSessionFactory } from './ports/provider_session_factory.interface.js';
import { sync_connection } from './sync_connection.js';

/** Dependencies of the connection sync service. */
export interface IConnectionSyncServiceOptions {
  connections: IConnectionStore;
  sessions: IProviderSessionFactory;
  stores: ISyncStores;
  /** Clock returning UTC milliseconds. */
  now: () => number;
  /** Generates ids for new runs and games. */
  generate_id: () => string;
}

/**
 * Syncs connections on demand (one, for a tenant) or on a schedule (every
 * eligible one), and records the result on the connection so one that has lost
 * its credentials stops being retried.
 */
export class ConnectionSyncService {
  public constructor(private readonly options: IConnectionSyncServiceOptions) {}

  /**
   * Syncs one of a tenant's connections.
   * @param tenant_id Owning tenant; a connection of another tenant is treated as missing.
   * @param connection_id Connection to sync.
   * @param actor Actor to stamp on every row written.
   * @param refresh_reference_data Force an organizations refresh.
   * @returns The runs, in the order they executed.
   * @throws ConnectionNotFoundError when the tenant has no such connection.
   * @throws ConnectionNotSyncableError when it is not CONNECTED.
   */
  public async sync_one(
    tenant_id: string,
    connection_id: string,
    actor: string,
    refresh_reference_data = false,
  ): Promise<ISyncRun[]> {
    const connection = await this.options.connections.get_connection(tenant_id, connection_id);
    if (!connection) throw new ConnectionNotFoundError(connection_id);
    if (connection.status !== ConnectionStatus.CONNECTED) {
      throw new ConnectionNotSyncableError(connection_id, connection.status);
    }

    const session = this.options.sessions.create_session(connection);
    const deps: ISyncDeps = {
      provider: session.provider,
      ctx: session.ctx,
      ...this.options.stores,
      now: this.options.now,
      generate_id: this.options.generate_id,
      rate_limit_remaining: session.rate_limit_remaining,
    };

    const runs = await sync_connection(deps, {
      tenant_id,
      connection_id,
      actor,
      refresh_reference_data,
    });
    const now = this.options.now();
    const outcome = derive_connection_outcome(runs, now);
    if (outcome) {
      await this.options.connections.record_sync_outcome(
        tenant_id,
        connection_id,
        outcome,
        actor,
        now,
      );
    }
    return runs;
  }

  /**
   * Runs a scheduled pass: syncs eligible connections, least recently synced
   * first, one at a time, and stops starting new ones once the time budget is
   * spent. One connection failing never stops the others.
   * @param actor Actor to stamp (a system id).
   * @param limit Most connections to consider.
   * @param budget_ms Time after which no further connection is started.
   * @returns What the pass did.
   */
  public async sync_all(
    actor: string,
    limit: number,
    budget_ms: number,
  ): Promise<IScheduledSyncSummary> {
    const started = this.options.now();
    const connections = await this.options.connections.list_syncable_connections(limit);
    const summary: IScheduledSyncSummary = { attempted: 0, succeeded: 0, failed: 0, deferred: 0 };

    for (const [index, connection] of connections.entries()) {
      if (this.options.now() - started > budget_ms) {
        summary.deferred = connections.length - index;
        break;
      }
      summary.attempted++;
      try {
        const runs = await this.sync_one(connection.tenant_id, connection.connection_id, actor);
        if (runs.some((run) => run.status === SyncRunStatus.FAILED)) summary.failed++;
        else summary.succeeded++;
      } catch (error) {
        summary.failed++;
        console.error('Scheduled sync failed for connection', connection.connection_id, error);
      }
    }
    return summary;
  }
}
