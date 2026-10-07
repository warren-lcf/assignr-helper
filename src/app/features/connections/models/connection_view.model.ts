import { ConnectionStatus } from '../enums/connection_status.enum';
import { IntegrationProvider } from '../enums/integration_provider.enum';

/** A tenant's connection to a scheduling provider, as `GET /api/connections` returns it. Never carries credentials. */
export interface IConnectionView {
  /** Connection id. */
  connection_id: string;
  /** Provider the connection is with. */
  provider: IntegrationProvider;
  /** Current status. */
  status: ConnectionStatus;
  /** The provider account's display name, once known. */
  account_label: string | null;
  /** When the last clean sync finished (UTC ms), or null if it never has. */
  last_sync_at: number | null;
  /** The last error recorded against the connection, or null. */
  last_error: string | null;
}
