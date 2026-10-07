/** Lifecycle of a locally captured match report. */
export enum MatchReportStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  /** The scheduling provider offers no way to submit this report. */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
}
