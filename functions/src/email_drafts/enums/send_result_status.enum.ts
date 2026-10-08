/** What a send did for one recipient, as reported to the owner. */
export enum SendResultStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  /** The contact is unsubscribed (or became so just before sending), so nothing was sent. */
  SKIPPED_UNSUBSCRIBED = 'SKIPPED_UNSUBSCRIBED',
  /** An earlier send of this draft already delivered to this recipient. */
  ALREADY_SENT = 'ALREADY_SENT',
}
