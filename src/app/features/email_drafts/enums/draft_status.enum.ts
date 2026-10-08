/** Where a draft is in its life. Mirrors the backend. */
export enum DraftStatus {
  /** Still being written; the only status that can be edited or deleted. */
  DRAFT = 'DRAFT',
  /** A send is running. */
  SENDING = 'SENDING',
  /** Sent to every recipient. */
  SENT = 'SENT',
  /** Sent, but some recipients failed. The failed ones can be retried. */
  PARTIALLY_SENT = 'PARTIALLY_SENT',
}
