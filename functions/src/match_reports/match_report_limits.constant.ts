/** Fixed limits of the match report API. */
export const MATCH_REPORT_LIMITS = {
  /** Most incidents (cards and other notes) one report may hold. */
  MAX_INCIDENTS_PER_REPORT: 60,
  /** Most reports one listing returns. */
  MAX_LISTED_REPORTS: 200,
  /** How often a write is retried after losing a race with another writer, including the first try. */
  MAX_WRITE_ATTEMPTS: 5,
  /** Highest goal count a team may be given. */
  MAX_SCORE: 99,
  /** Longest report-level notes text. */
  MAX_REPORT_NOTES_LENGTH: 2000,
  /** Longest incident notes text. */
  MAX_INCIDENT_NOTES_LENGTH: 500,
  /** Highest shirt number an incident may name. */
  MAX_JERSEY_NUMBER: 99,
  /** Latest minute an incident may name (full time plus extra time and stoppage). */
  MAX_MINUTE: 130,
  /** Longest reason code. */
  MAX_REASON_CODE_LENGTH: 64,
} as const;
