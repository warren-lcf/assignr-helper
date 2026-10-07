import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { ConnectionStatus } from './enums/connection_status.enum.js';
import { ConnectionTestFailure } from './enums/connection_test_failure.enum.js';
import { ConnectionAccountMismatchError } from './errors/connection_account_mismatch.error.js';
import { ConnectionCredentialsRejectedError } from './errors/connection_credentials_rejected.error.js';
import { ConnectionNotFoundError } from './errors/connection_not_found.error.js';
import { IAdminActor } from './models/admin_actor.model.js';
import { IConnection } from './models/connection.model.js';
import { IConnectionCredentialsInput } from './models/connection_credentials_input.model.js';
import { IConnectionTestResult } from './models/connection_test_result.model.js';
import { IReplaceCredentialsInput } from './models/replace_credentials_input.model.js';
import { IStoredCredentials } from './models/stored_credentials.model.js';
import { ConnectionCredentialsIncompleteError } from './errors/connection_credentials_incomplete.error.js';
import { IAccountVerifier } from './ports/account_verifier.interface.js';
import { IConnectionStore } from './ports/connection_store.interface.js';
import { ICredentialVault } from './ports/credential_vault.interface.js';
import { ITokenInvalidator } from './ports/token_invalidator.interface.js';

/** Audit resource type for provider connections. */
export const CONNECTION_AUDIT_RESOURCE = 'integration_connection';

/** Dependencies of the connection admin service. */
export interface IConnectionAdminServiceOptions {
  connections: IConnectionStore;
  vault: ICredentialVault;
  verifier: IAccountVerifier;
  token_invalidator: ITokenInvalidator;
  audit: AuditLogService;
  now: () => number;
  generate_id: () => string;
}

/**
 * Lets a tenant manage its provider connections: add one by entering client
 * credentials (verified against the provider before anything is saved), replace
 * the credentials, test them, and disconnect. Secrets go only to the credential
 * vault; every change writes an audit row that carries the connection's status
 * and label, never a secret.
 */
export class ConnectionAdminService {
  public constructor(private readonly options: IConnectionAdminServiceOptions) {}

  /**
   * Connects a provider account. Credentials the provider rejects store nothing.
   * Connecting an account the tenant already has reuses that connection (this is
   * how a disconnected or flagged connection is reconnected, and why a retry
   * after a partial failure never duplicates one).
   * @param actor Who is acting.
   * @param input Provider and client credentials.
   * @returns The connection.
   * @throws ConnectionCredentialsRejectedError when the provider rejects the credentials.
   */
  public async create_connection(
    actor: IAdminActor,
    input: IConnectionCredentialsInput,
  ): Promise<IConnection> {
    const credentials = this.to_credentials(input);
    const account = await this.options.verifier.verify(input.provider, credentials);

    const existing = (await this.options.connections.list_connections(actor.tenant_id)).find(
      (connection) =>
        connection.provider === input.provider &&
        connection.external_account_id === account.external_account_id,
    );
    const now = this.options.now();
    const connection_id = existing?.connection_id ?? this.options.generate_id();
    const saved: IConnection = {
      tenant_id: actor.tenant_id,
      connection_id,
      provider: input.provider,
      status: ConnectionStatus.CONNECTED,
      account_label: account.label,
      external_account_id: account.external_account_id,
      secret_ref: `tenant-${actor.tenant_id}-connection-${connection_id}`,
      scopes: existing?.scopes ?? [],
      last_sync_at: existing?.last_sync_at ?? null,
      last_error: null,
      created_at: existing?.created_at ?? now,
      created_by: existing?.created_by ?? actor.user_id,
      updated_at: now,
      updated_by: actor.user_id,
    };

    await this.options.vault.write(actor.tenant_id, connection_id, credentials);
    try {
      await this.options.connections.save_connection(saved);
    } catch (error) {
      if (!existing) await this.options.vault.delete(actor.tenant_id, connection_id);
      throw error;
    }
    this.options.token_invalidator.invalidate(actor.tenant_id, connection_id);

    await this.audit(
      actor,
      existing ? AuditAction.UPDATE : AuditAction.CREATE,
      connection_id,
      existing ?? null,
      saved,
    );
    return saved;
  }

  /**
   * Replaces a connection's credentials, for example after rotating them with the
   * provider. The new credentials must belong to the same provider account.
   * @param actor Who is acting.
   * @param connection_id Connection to update.
   * @param input New client secret, and a new client id if it changed.
   * @returns The connection, back to CONNECTED with its last error cleared.
   * @throws ConnectionNotFoundError when the tenant has no such connection.
   * @throws ConnectionCredentialsIncompleteError when no client id is given and none is stored.
   * @throws ConnectionCredentialsRejectedError when the provider rejects them.
   * @throws ConnectionAccountMismatchError when they belong to a different account.
   */
  public async replace_credentials(
    actor: IAdminActor,
    connection_id: string,
    input: IReplaceCredentialsInput,
  ): Promise<IConnection> {
    const connection = await this.require_connection(actor.tenant_id, connection_id);
    const client_id =
      input.client_id ?? (await this.options.vault.read(actor.tenant_id, connection_id))?.client_id;
    if (!client_id) throw new ConnectionCredentialsIncompleteError(connection_id);
    const credentials: IStoredCredentials = { client_id, client_secret: input.client_secret };
    const account = await this.options.verifier.verify(connection.provider, credentials);
    if (
      connection.external_account_id !== null &&
      connection.external_account_id !== account.external_account_id
    ) {
      throw new ConnectionAccountMismatchError(connection_id);
    }

    const saved: IConnection = {
      ...connection,
      status: ConnectionStatus.CONNECTED,
      account_label: account.label ?? connection.account_label,
      external_account_id: account.external_account_id,
      last_error: null,
      updated_at: this.options.now(),
      updated_by: actor.user_id,
    };
    await this.options.vault.write(actor.tenant_id, connection_id, credentials);
    await this.options.connections.save_connection(saved);
    this.options.token_invalidator.invalidate(actor.tenant_id, connection_id);

    await this.audit(actor, AuditAction.UPDATE, connection_id, connection, saved);
    return saved;
  }

  /**
   * Tests a connection's stored credentials without changing anything.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection to test.
   * @returns Whether the provider accepts them, and why not if it does not.
   * @throws ConnectionNotFoundError when the tenant has no such connection.
   */
  public async test_connection(
    tenant_id: string,
    connection_id: string,
  ): Promise<IConnectionTestResult> {
    const connection = await this.require_connection(tenant_id, connection_id);
    const credentials = await this.options.vault.read(tenant_id, connection_id);
    if (!credentials) return { ok: false, failure: ConnectionTestFailure.NO_CREDENTIALS };
    try {
      await this.options.verifier.verify(connection.provider, credentials);
      return { ok: true, failure: null };
    } catch (error) {
      if (error instanceof ConnectionCredentialsRejectedError) {
        return { ok: false, failure: ConnectionTestFailure.REJECTED };
      }
      console.error('Connection test could not reach the provider', connection_id, error);
      return { ok: false, failure: ConnectionTestFailure.UNREACHABLE };
    }
  }

  /**
   * Disconnects: deletes the stored credentials and marks the connection
   * DISCONNECTED. Synced games are kept.
   * @param actor Who is acting.
   * @param connection_id Connection to disconnect.
   * @returns The updated connection.
   * @throws ConnectionNotFoundError when the tenant has no such connection.
   */
  public async disconnect(actor: IAdminActor, connection_id: string): Promise<IConnection> {
    const connection = await this.require_connection(actor.tenant_id, connection_id);
    await this.options.vault.delete(actor.tenant_id, connection_id);
    const saved: IConnection = {
      ...connection,
      status: ConnectionStatus.DISCONNECTED,
      updated_at: this.options.now(),
      updated_by: actor.user_id,
    };
    await this.options.connections.save_connection(saved);
    this.options.token_invalidator.invalidate(actor.tenant_id, connection_id);

    await this.audit(actor, AuditAction.DELETE, connection_id, connection, saved);
    return saved;
  }

  private async require_connection(tenant_id: string, connection_id: string): Promise<IConnection> {
    const connection = await this.options.connections.get_connection(tenant_id, connection_id);
    if (!connection) throw new ConnectionNotFoundError(connection_id);
    return connection;
  }

  private to_credentials(input: IConnectionCredentialsInput): IStoredCredentials {
    return { client_id: input.client_id, client_secret: input.client_secret };
  }

  /** Audit state is a deliberate allow-list: status and labels only, never credentials. */
  private audit_state(connection: IConnection | null): object | null {
    if (!connection) return null;
    return {
      connection_id: connection.connection_id,
      provider: connection.provider,
      status: connection.status,
      account_label: connection.account_label,
      external_account_id: connection.external_account_id,
    };
  }

  private async audit(
    actor: IAdminActor,
    action: AuditAction,
    connection_id: string,
    before: IConnection | null,
    after: IConnection,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: CONNECTION_AUDIT_RESOURCE,
      resource_id: connection_id,
      action,
      before_state: this.audit_state(before),
      after_state: this.audit_state(after),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
