import { IntegrationProvider } from '../../../integrations/enums/integration_provider.enum.js';
import { ConnectionStatus } from '../../enums/connection_status.enum.js';
import { IConnection } from '../../models/connection.model.js';

/**
 * Builds a connected, never-synced connection for contract tests.
 * @param tenant_id Owning tenant.
 * @param connection_id Primary key of the connection within the tenant.
 * @param overrides Fields to replace.
 * @returns A complete connection.
 */
export function make_contract_connection(
  tenant_id: string,
  connection_id: string,
  overrides: Partial<IConnection> = {},
): IConnection {
  return {
    tenant_id,
    connection_id,
    provider: IntegrationProvider.ASSIGNR,
    status: ConnectionStatus.CONNECTED,
    account_label: null,
    external_account_id: null,
    secret_ref: null,
    scopes: [],
    last_sync_at: null,
    last_error: null,
    created_at: 1000,
    created_by: 'creator',
    updated_at: 1000,
    updated_by: 'creator',
    ...overrides,
  };
}
