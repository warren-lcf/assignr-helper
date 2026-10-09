import { QUEUE_STORAGE_KEY_PREFIX } from '../constants/sync_backoff.constant';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { IQueueRecord } from '../models/queue_record.model';
import { QueuedOperation } from '../models/queued_operation.model';

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function is_operation(value: unknown): value is QueuedOperation {
  return (
    is_record(value) &&
    typeof value['seq'] === 'number' &&
    Object.values(ReportOperationKind).some((kind) => kind === value['kind'])
  );
}

/**
 * The browser storage key of one report's waiting edits.
 * @param report_id The report's id.
 * @returns The key.
 */
export function queue_storage_key(report_id: string): string {
  return `${QUEUE_STORAGE_KEY_PREFIX}${report_id}`;
}

/**
 * Reads a report's waiting edits. Browser storage can be missing, throw or hold something unreadable
 * (private windows, blocked site data, an old version), so any failure means "nothing waiting".
 * @param report_id The report's id.
 * @returns The stored edits and counters, or null.
 */
export function read_queue_record(report_id: string): IQueueRecord | null {
  try {
    const raw = localStorage.getItem(queue_storage_key(report_id));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !is_record(parsed) ||
      parsed['report_id'] !== report_id ||
      typeof parsed['revision'] !== 'number' ||
      typeof parsed['last_seq'] !== 'number' ||
      !Array.isArray(parsed['queue'])
    ) {
      return null;
    }
    return {
      report_id,
      revision: parsed['revision'],
      last_seq: parsed['last_seq'],
      queue: parsed['queue'].filter(is_operation),
    };
  } catch (error) {
    console.error('Could not read the waiting match report changes', error);
    return null;
  }
}

/**
 * Keeps a report's waiting edits so they survive a reload. An empty queue removes the entry, since the
 * server holds everything. Failing to store is not fatal: the screen works, just without durability.
 * @param record The edits and counters to keep.
 * @returns Nothing.
 */
export function write_queue_record(record: IQueueRecord): void {
  try {
    if (record.queue.length === 0) localStorage.removeItem(queue_storage_key(record.report_id));
    else localStorage.setItem(queue_storage_key(record.report_id), JSON.stringify(record));
  } catch (error) {
    console.error('Could not keep the waiting match report changes', error);
  }
}
