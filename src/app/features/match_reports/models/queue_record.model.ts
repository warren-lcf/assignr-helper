import { QueuedOperation } from './queued_operation.model';

/** What is kept in browser storage for one report: the edits not yet accepted and the counters that must never repeat. */
export interface IQueueRecord {
  report_id: string;
  /** The last score revision handed out, so a reload never reuses one. */
  revision: number;
  /** The last `seq` handed out. */
  last_seq: number;
  queue: QueuedOperation[];
}
