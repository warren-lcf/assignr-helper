import { IConnection } from '../../connections/models/connection.model.js';
import { ISyncSession } from '../models/sync_session.model.js';

/** Port that builds the provider session for a connection. */
export interface IProviderSessionFactory {
  /**
   * Builds (or reuses) the session for a connection.
   * @param connection The connection to sync.
   * @returns The provider, its per-call context and a rate-limit reader.
   * @throws When the connection's provider is not supported.
   */
  create_session(connection: IConnection): ISyncSession;
}
