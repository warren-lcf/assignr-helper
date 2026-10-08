/** No email draft with that id exists for the tenant. */
export class EmailDraftNotFoundError extends Error {
  public constructor(public readonly draft_id: string) {
    super(`Email draft ${draft_id} was not found`);
    this.name = 'EmailDraftNotFoundError';
  }
}
