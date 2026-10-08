/** What happened when a draft was deleted. */
export enum DeleteDraftOutcome {
  DELETED = 'DELETED',
  /** The tenant has no such draft. */
  NOT_FOUND = 'NOT_FOUND',
  /** Only a DRAFT can be deleted. */
  NOT_DRAFT = 'NOT_DRAFT',
}
