/** Outcome of one sync run. */
export enum SyncRunStatus {
  /** Still in progress. */
  RUNNING = 'RUNNING',
  /** Finished cleanly. */
  SUCCEEDED = 'SUCCEEDED',
  /** Stopped with an error. */
  FAILED = 'FAILED',
  /** Not attempted, e.g. an earlier step failed. */
  SKIPPED = 'SKIPPED',
}
