/** What one scheduled pass over the eligible connections did. */
export interface IScheduledSyncSummary {
  /** Connections a sync was started for. */
  attempted: number;
  /** Attempts where no run failed. */
  succeeded: number;
  /** Attempts where a run failed or the attempt itself threw. */
  failed: number;
  /** Eligible connections left for the next pass because the time budget ran out. */
  deferred: number;
}
