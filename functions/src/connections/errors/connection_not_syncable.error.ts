import { ConnectionStatus } from '../enums/connection_status.enum.js';

/** The connection exists but is not in a state that can be synced. */
export class ConnectionNotSyncableError extends Error {
  public constructor(
    public readonly connection_id: string,
    public readonly status: ConnectionStatus,
  ) {
    super(`Connection ${connection_id} cannot be synced while it is ${status}`);
    this.name = 'ConnectionNotSyncableError';
  }
}
