/** What is recorded for a recipient of a draft after an attempt. */
export enum DeliveryStatus {
  /** The vendor accepted the email. Final: a retry never sends to this recipient again. */
  SENT = 'SENT',
  /** The attempt failed. A retry of a partially sent draft tries again. */
  FAILED = 'FAILED',
}
