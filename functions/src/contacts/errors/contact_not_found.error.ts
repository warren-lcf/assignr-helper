/** No contact with that id exists for the tenant. */
export class ContactNotFoundError extends Error {
  public constructor(public readonly contact_id: string) {
    super(`Contact ${contact_id} was not found`);
    this.name = 'ContactNotFoundError';
  }
}
