import { IStoredCredentials } from './models/stored_credentials.model.js';
import { ICredentialVault } from './ports/credential_vault.interface.js';

/** In-memory credential vault: the reference behaviour, and the double for specs. */
export class InMemoryCredentialVault implements ICredentialVault {
  private readonly entries = new Map<string, IStoredCredentials>();

  /** @inheritdoc */
  public async read(tenant_id: string, connection_id: string): Promise<IStoredCredentials | null> {
    const found = this.entries.get(this.key(tenant_id, connection_id));
    return found ? { ...found } : null;
  }

  /** @inheritdoc */
  public async write(
    tenant_id: string,
    connection_id: string,
    credentials: IStoredCredentials,
  ): Promise<void> {
    this.entries.set(this.key(tenant_id, connection_id), { ...credentials });
  }

  /** @inheritdoc */
  public async delete(tenant_id: string, connection_id: string): Promise<void> {
    this.entries.delete(this.key(tenant_id, connection_id));
  }

  private key(tenant_id: string, connection_id: string): string {
    return JSON.stringify([tenant_id, connection_id]);
  }
}
