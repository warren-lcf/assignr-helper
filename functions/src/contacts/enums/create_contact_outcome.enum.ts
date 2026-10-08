/** What happened when a contact was offered to the store. */
export enum CreateContactOutcome {
  /** The contact was saved. */
  CREATED = 'CREATED',
  /** The tenant already has a contact with this address (compared ignoring case). */
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  /**
   * The address belonged to a contact who unsubscribed and was then deleted. It is never added
   * again, so deleting a contact can not be used to undo an opt-out.
   */
  SUPPRESSED = 'SUPPRESSED',
}
