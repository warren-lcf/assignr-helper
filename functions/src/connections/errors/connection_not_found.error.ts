/** No connection with that id exists for the tenant. */
export class ConnectionNotFoundError extends Error {
  public constructor(public readonly connection_id: string) {
    super(`Connection ${connection_id} was not found`);
    this.name = 'ConnectionNotFoundError';
  }
}
