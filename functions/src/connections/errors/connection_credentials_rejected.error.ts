/** The provider refused the supplied client credentials. The message never includes them. */
export class ConnectionCredentialsRejectedError extends Error {
  public constructor() {
    super('The provider rejected these credentials');
    this.name = 'ConnectionCredentialsRejectedError';
  }
}
