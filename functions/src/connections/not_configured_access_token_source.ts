import { ConnectionNotAuthorizedError } from './errors/connection_not_authorized.error.js';
import { IConnection } from './models/connection.model.js';
import { IAccessTokenSource } from './ports/access_token_source.interface.js';

/**
 * Token source used until the OAuth connect flow exists: it never has a token,
 * so every sync of a connection fails clearly as "needs to be reconnected"
 * instead of calling the provider without credentials.
 */
export class NotConfiguredAccessTokenSource implements IAccessTokenSource {
  /** @inheritdoc */
  public async get_access_token(connection: IConnection): Promise<string> {
    throw new ConnectionNotAuthorizedError(connection.connection_id);
  }
}
