/**
 * Per-call context handed to a provider. Tokens are resolved lazily so a
 * provider always gets a valid (refreshed) access token without ever reading
 * a secret itself.
 */
export interface IProviderContext {
  tenant_id: string;
  connection_id: string;
  /** Resolves a valid access token, refreshing it when necessary. */
  get_access_token: () => Promise<string>;
}
