/** Where a match report is in its life. Mirrors the backend. */
export enum ReportStatus {
  /** Still being written; the only status that can be edited. */
  DRAFT = 'DRAFT',
  /** Finished by the referee and locked; stays in this app for now. */
  READY = 'READY',
  /** Sent to the scheduling provider. */
  SUBMITTED = 'SUBMITTED',
  /** The provider has no supported way to receive reports. */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
}
