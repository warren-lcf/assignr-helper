/** What happened when a draft's content was written. */
export enum DraftWriteOutcome {
  UPDATED = 'UPDATED',
  /** The tenant has no such draft. */
  NOT_FOUND = 'NOT_FOUND',
  /** The draft is no longer a DRAFT (a send started or finished), so it is locked. */
  NOT_DRAFT = 'NOT_DRAFT',
  /** Someone else changed the draft since it was read; read it again and retry. */
  STALE = 'STALE',
}
