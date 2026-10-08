/** What happened to one recipient of a send. Mirrors the backend. */
export enum SendResultStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  /** The contact had unsubscribed, so nothing was sent. */
  SKIPPED_UNSUBSCRIBED = 'SKIPPED_UNSUBSCRIBED',
  /** An earlier send already reached this contact, so nothing was sent again. */
  ALREADY_SENT = 'ALREADY_SENT',
}
