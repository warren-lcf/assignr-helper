import { IStoredCredentials } from '../models/stored_credentials.model.js';

/** Port to the secret store holding each connection's client credentials. */
export interface ICredentialVault {
  /**
   * Reads a connection's credentials.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns The credentials, or null when none are stored.
   */
  read(tenant_id: string, connection_id: string): Promise<IStoredCredentials | null>;

  /**
   * Stores (or replaces) a connection's credentials.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @param credentials The new credentials.
   * @returns Resolves when stored.
   */
  write(tenant_id: string, connection_id: string, credentials: IStoredCredentials): Promise<void>;

  /**
   * Removes a connection's credentials.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns Resolves when removed; removing nothing is not an error.
   */
  delete(tenant_id: string, connection_id: string): Promise<void>;
}
