import { SyncKind } from '../enums/sync_kind.enum.js';
import { ISyncRun } from '../models/sync_run.model.js';

/** Persistence port for sync runs. */
export interface ISyncRunStore {
  /**
   * Inserts or replaces a run by `run_id`.
   * @param run Complete run row.
   * @returns Resolves when saved.
   */
  save_run(run: ISyncRun): Promise<void>;

  /**
   * Finds a run of this kind still marked running that started after `started_after`.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param kind Run kind.
   * @param started_after UTC milliseconds; older running rows are treated as abandoned.
   * @returns The active run, or null.
   */
  find_active_run(
    tenant_id: string,
    connection_id: string,
    kind: SyncKind,
    started_after: number,
  ): Promise<ISyncRun | null>;

  /**
   * Lists a connection's runs, newest first.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param limit Maximum rows.
   * @returns Runs ordered by `started_at` descending.
   */
  list_runs(tenant_id: string, connection_id: string, limit: number): Promise<ISyncRun[]>;
}
