import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';
import { ConnectionStatus } from '../enums/connection_status.enum.js';

/** A connection as the API returns it: never the secret reference, tenant id or audit stamps. */
export interface IConnectionView {
  connection_id: string;
  provider: IntegrationProvider;
  status: ConnectionStatus;
  account_label: string | null;
  last_sync_at: number | null;
  last_error: string | null;
}
