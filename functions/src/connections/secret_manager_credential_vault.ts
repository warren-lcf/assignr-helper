import type { SecretManagerClient } from '@hch-shared-libraries/core-server';
import { IStoredCredentials } from './models/stored_credentials.model.js';
import { ICredentialVault } from './ports/credential_vault.interface.js';

/**
 * Credential vault over Google Secret Manager through core-server's client. Each
 * connection's credentials are one tenant secret holding JSON, named by
 * core-server's convention `tenant-<tenant_id>-connection-<connection_id>`.
 * Nothing is ever written to the database.
 */
export class SecretManagerCredentialVault implements ICredentialVault {
  public constructor(private readonly secrets: SecretManagerClient) {}

  /** @inheritdoc */
  public async read(tenant_id: string, connection_id: string): Promise<IStoredCredentials | null> {
    const raw = await this.secrets.get_tenant_secret(tenant_id, this.provider_key(connection_id));
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`The stored credentials for connection ${connection_id} are unreadable`);
    }
    const candidate = parsed as { client_id?: unknown; client_secret?: unknown } | null;
    if (
      !candidate ||
      typeof candidate.client_id !== 'string' ||
      typeof candidate.client_secret !== 'string'
    ) {
      throw new Error(`The stored credentials for connection ${connection_id} are unreadable`);
    }
    return { client_id: candidate.client_id, client_secret: candidate.client_secret };
  }

  /** @inheritdoc */
  public async write(
    tenant_id: string,
    connection_id: string,
    credentials: IStoredCredentials,
  ): Promise<void> {
    await this.secrets.put_tenant_secret(
      tenant_id,
      this.provider_key(connection_id),
      JSON.stringify({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
      }),
    );
  }

  /** @inheritdoc */
  public async delete(tenant_id: string, connection_id: string): Promise<void> {
    await this.secrets.delete_tenant_secret(tenant_id, this.provider_key(connection_id));
  }

  private provider_key(connection_id: string): string {
    return `connection-${connection_id}`;
  }
}
