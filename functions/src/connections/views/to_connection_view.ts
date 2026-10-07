import { IConnection } from '../models/connection.model.js';
import { IConnectionView } from './connection_view.model.js';

/**
 * Projects a stored connection to its API shape, leaving out where its
 * credentials live.
 * @param connection Stored connection.
 * @returns The public view.
 */
export function to_connection_view(connection: IConnection): IConnectionView {
  return {
    connection_id: connection.connection_id,
    provider: connection.provider,
    status: connection.status,
    account_label: connection.account_label,
    last_sync_at: connection.last_sync_at,
    last_error: connection.last_error,
  };
}
