import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { IConnection } from '../connections/models/connection.model.js';
import { IntegrationProvider } from '../integrations/enums/integration_provider.enum.js';

/**
 * Builds a connection for specs, with sensible defaults.
 * @param overrides Fields to replace.
 * @returns A complete connection.
 */
export function make_connection(overrides: Partial<IConnection> = {}): IConnection {
  return {
    tenant_id: 't1',
    connection_id: 'c1',
    provider: IntegrationProvider.ASSIGNR,
    status: ConnectionStatus.CONNECTED,
    account_label: 'Metro Youth Soccer',
    external_account_id: 'acct-1',
    secret_ref: 'secret/never-exposed',
    scopes: ['read', 'write'],
    last_sync_at: null,
    last_error: null,
    created_at: 1000,
    created_by: 'seed',
    updated_at: 1000,
    updated_by: 'seed',
    ...overrides,
  };
}
