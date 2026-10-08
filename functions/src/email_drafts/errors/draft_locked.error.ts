/** The draft is no longer a DRAFT (it is sending or has been sent), so it cannot change or be sent now. */
export class DraftLockedError extends Error {
  public constructor(public readonly draft_id: string) {
    super(`Email draft ${draft_id} is locked`);
    this.name = 'DraftLockedError';
  }
}
