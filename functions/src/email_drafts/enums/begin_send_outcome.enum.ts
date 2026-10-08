/** What happened when a send tried to take the lock on a draft. */
export enum BeginSendOutcome {
  /** This caller holds the lock and may send. */
  STARTED = 'STARTED',
  /** The tenant has no such draft. */
  NOT_FOUND = 'NOT_FOUND',
  /** The draft is already sending (recently) or already fully sent. */
  NOT_SENDABLE = 'NOT_SENDABLE',
}
