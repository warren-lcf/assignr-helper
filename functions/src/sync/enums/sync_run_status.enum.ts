/** Lifecycle of a sync run. */
export enum SyncRunStatus {
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  /** Not started because another run for the same connection and kind is in progress. */
  SKIPPED = 'SKIPPED',
}
