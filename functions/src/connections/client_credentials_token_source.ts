import { AssignrCredentialsRejectedError } from '../integrations/assignr/errors/assignr_credentials_rejected_error.js';
import {
  AssignrTokenClient,
  IAssignrAccessToken,
} from '../integrations/assignr/assignr_token_client.js';
import { ConnectionNotAuthorizedError } from './errors/connection_not_authorized.error.js';
import { IConnection } from './models/connection.model.js';
import { IAccessTokenSource } from './ports/access_token_source.interface.js';
import { ICredentialVault } from './ports/credential_vault.interface.js';
import { ITokenInvalidator } from './ports/token_invalidator.interface.js';

/** Dependencies of the token source. */
export interface IClientCredentialsTokenSourceOptions {
  vault: ICredentialVault;
  token_client: AssignrTokenClient;
  now?: () => number;
}

/** A token is renewed this long before it expires, so a request never carries one about to lapse. */
const EXPIRY_SKEW_MS = 120_000;

/**
 * Provides access tokens from each connection's own client credentials. Tokens are
 * short-lived and cheap to re-request, so they are cached only in memory (never
 * stored); concurrent requests for the same connection share one token request.
 * Credentials the provider rejects, or none stored at all, surface as
 * {@link ConnectionNotAuthorizedError} so the sync flags the connection.
 */
export class ClientCredentialsTokenSource implements IAccessTokenSource, ITokenInvalidator {
  private readonly cache = new Map<string, IAssignrAccessToken>();
  private readonly in_flight = new Map<string, Promise<string>>();
  private readonly now: () => number;

  public constructor(private readonly options: IClientCredentialsTokenSourceOptions) {
    this.now = options.now ?? Date.now;
  }

  /** @inheritdoc */
  public get_access_token(connection: IConnection): Promise<string> {
    const key = this.key(connection.tenant_id, connection.connection_id);
    const cached = this.cache.get(key);
    if (cached && cached.expires_at - EXPIRY_SKEW_MS > this.now()) {
      return Promise.resolve(cached.access_token);
    }
    const pending = this.in_flight.get(key);
    if (pending) return pending;

    const request = this.request_token(connection, key).finally(() => this.in_flight.delete(key));
    this.in_flight.set(key, request);
    return request;
  }

  /**
   * Forgets a connection's cached token, after its credentials were replaced or removed.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns Nothing.
   */
  public invalidate(tenant_id: string, connection_id: string): void {
    this.cache.delete(this.key(tenant_id, connection_id));
  }

  private async request_token(connection: IConnection, key: string): Promise<string> {
    const credentials = await this.options.vault.read(
      connection.tenant_id,
      connection.connection_id,
    );
    if (!credentials) throw new ConnectionNotAuthorizedError(connection.connection_id);
    try {
      const token = await this.options.token_client.request_token(credentials);
      this.cache.set(key, token);
      return token.access_token;
    } catch (error) {
      if (error instanceof AssignrCredentialsRejectedError) {
        this.cache.delete(key);
        throw new ConnectionNotAuthorizedError(connection.connection_id);
      }
      throw error;
    }
  }

  private key(tenant_id: string, connection_id: string): string {
    return JSON.stringify([tenant_id, connection_id]);
  }
}
