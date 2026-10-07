import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';
import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';
import { ConnectionStatus } from '../enums/connection_status.enum.js';

/**
 * A tenant's connection to one scheduling provider account. Credentials are
 * never stored here: `secret_ref` only names where they live in Secret Manager.
 */
export interface IConnection extends IAuditStamp {
  tenant_id: string;
  connection_id: string;
  provider: IntegrationProvider;
  status: ConnectionStatus;
  /** Display label, e.g. the account's name. */
  account_label: string | null;
  /** The provider's own id for the connected account. */
  external_account_id: string | null;
  secret_ref: string | null;
  scopes: string[];
  /** UTC milliseconds of the last fully successful sync, if any. */
  last_sync_at: number | null;
  /** Message of the last failure; null after a success. Never contains tokens. */
  last_error: string | null;
}
