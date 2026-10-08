/** Where an email draft is in its life. */
export enum DraftStatus {
  /** Being written. Only a draft in this state can be edited or deleted. */
  DRAFT = 'DRAFT',
  /** A send is under way. Locked, so a second request cannot send the same draft twice. */
  SENDING = 'SENDING',
  /** Every eligible recipient has been sent the email. */
  SENT = 'SENT',
  /** Some recipients were sent the email and some failed. It may be sent again to retry the rest. */
  PARTIALLY_SENT = 'PARTIALLY_SENT',
}
