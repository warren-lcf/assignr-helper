/** The draft kept changing under the writer, so the update gave up. Try again. */
export class DraftConflictError extends Error {
  public constructor(public readonly draft_id: string) {
    super(`Email draft ${draft_id} was changed by someone else`);
    this.name = 'DraftConflictError';
  }
}
