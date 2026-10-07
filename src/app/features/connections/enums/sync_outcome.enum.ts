/** How a "Sync now" call went overall, judged from the runs it returned. */
export enum SyncOutcome {
  /** No step failed. */
  SUCCESS = 'SUCCESS',
  /** Some steps failed and some succeeded. */
  PARTIAL = 'PARTIAL',
  /** Every step that ran failed. */
  FAILED = 'FAILED',
}
