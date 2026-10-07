import { SyncKind } from '../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../enums/sync_run_status.enum.js';
import { ISyncRun } from '../models/sync_run.model.js';
import { ISyncRunStore } from '../ports/sync_run_store.interface.js';

/** In-memory `ISyncRunStore` for tests and local development. Reads and writes are copies. */
export class InMemorySyncRunStore implements ISyncRunStore {
  private readonly rows = new Map<string, ISyncRun>();

  /**
   * Inserts or replaces a run by `run_id`, storing a copy.
   * @param run Complete run row.
   * @returns Resolves when saved.
   */
  public async save_run(run: ISyncRun): Promise<void> {
    this.rows.set(run.run_id, structuredClone(run));
  }

  /**
   * Finds a run of this kind still marked running that started after `started_after`.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param kind Run kind.
   * @param started_after UTC milliseconds (exclusive); older running rows are treated as abandoned.
   * @returns A copy of the newest active run, or null.
   */
  public async find_active_run(
    tenant_id: string,
    connection_id: string,
    kind: SyncKind,
    started_after: number,
  ): Promise<ISyncRun | null> {
    const newest = this.sorted_newest_first().find(
      (row) =>
        row.tenant_id === tenant_id &&
        row.connection_id === connection_id &&
        row.kind === kind &&
        row.status === SyncRunStatus.RUNNING &&
        row.started_at > started_after,
    );
    return newest ? structuredClone(newest) : null;
  }

  /**
   * Lists a connection's runs, newest first.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection.
   * @param limit Maximum rows.
   * @returns Copies ordered by `started_at` descending, ties by `run_id`.
   */
  public async list_runs(
    tenant_id: string,
    connection_id: string,
    limit: number,
  ): Promise<ISyncRun[]> {
    return this.sorted_newest_first()
      .filter((row) => row.tenant_id === tenant_id && row.connection_id === connection_id)
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  /**
   * Orders stored rows by `started_at` descending, then `run_id` ascending.
   * @returns The stored rows (not copies); callers must clone before returning them.
   */
  private sorted_newest_first(): ISyncRun[] {
    return [...this.rows.values()].sort(
      (a, b) => b.started_at - a.started_at || (a.run_id < b.run_id ? -1 : 1),
    );
  }
}
