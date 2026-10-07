import { IConnection } from '../models/connection.model.js';

/**
 * Port that yields a valid provider access token for a connection, refreshing
 * it when needed. Where tokens live (Secret Manager) and how they refresh is
 * the OAuth connect flow's concern, not the sync's.
 */
export interface IAccessTokenSource {
  /**
   * Gets a valid access token.
   * @param connection The connection to authorize as.
   * @returns A bearer token.
   * @throws ConnectionNotAuthorizedError when the connection has no usable credentials.
   */
  get_access_token(connection: IConnection): Promise<string>;
}
