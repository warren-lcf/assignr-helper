/** New credentials belong to a different provider account than the connection they would replace. */
export class ConnectionAccountMismatchError extends Error {
  public constructor(public readonly connection_id: string) {
    super(`The new credentials belong to a different account than connection ${connection_id}`);
    this.name = 'ConnectionAccountMismatchError';
  }
}
