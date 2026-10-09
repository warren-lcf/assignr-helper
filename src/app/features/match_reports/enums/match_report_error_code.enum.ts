/** Machine-readable reasons the match report endpoints refuse a request, beyond the shared ones. Mirrors the backend. */
export enum MatchReportErrorCode {
  GAME_CANCELLED = 'GAME_CANCELLED',
  REPORT_NOT_READY = 'REPORT_NOT_READY',
  REPORT_NOT_EDITABLE = 'REPORT_NOT_EDITABLE',
  IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT',
  TOO_MANY_INCIDENTS = 'TOO_MANY_INCIDENTS',
  REPORT_CONFLICT = 'REPORT_CONFLICT',
}
