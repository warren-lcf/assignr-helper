/** What happened when an edit was written to a stored match report. */
export enum MatchReportWriteOutcome {
  /** The edit was saved and the report's `lock_version` moved forward. */
  APPLIED = 'APPLIED',
  /** Another writer changed the report since the caller read it; nothing was saved. */
  LOST_RACE = 'LOST_RACE',
  /** This tenant has no such report; nothing was saved. */
  NOT_FOUND = 'NOT_FOUND',
  /** The incident's idempotency key already belongs to an incident of this tenant; nothing was saved. */
  IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT',
}
