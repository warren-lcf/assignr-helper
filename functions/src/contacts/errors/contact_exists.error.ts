/** The tenant already has a contact with this address, or the address opted out earlier. */
export class ContactExistsError extends Error {
  public constructor() {
    super('A contact with this email address already exists');
    this.name = 'ContactExistsError';
  }
}
