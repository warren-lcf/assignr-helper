/** A credential change omitted the client id and none is stored to reuse. */
export class ConnectionCredentialsIncompleteError extends Error {
  public constructor(public readonly connection_id: string) {
    super(`Connection ${connection_id} has no stored client id; supply one`);
    this.name = 'ConnectionCredentialsIncompleteError';
  }
}
