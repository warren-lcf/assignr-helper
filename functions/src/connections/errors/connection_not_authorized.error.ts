/** The connection has no usable credentials; its owner must reconnect it. */
export class ConnectionNotAuthorizedError extends Error {
  public constructor(public readonly connection_id: string) {
    super(`Connection ${connection_id} needs to be reconnected`);
    this.name = 'ConnectionNotAuthorizedError';
  }
}
