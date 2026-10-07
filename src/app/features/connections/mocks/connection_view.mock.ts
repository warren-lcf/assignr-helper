import { ConnectionStatus } from '../enums/connection_status.enum';
import { IntegrationProvider } from '../enums/integration_provider.enum';
import { IConnectionView } from '../models/connection_view.model';

/**
 * Builds a connection fixture.
 * @param overrides Fields to change from a healthy, synced connection.
 * @returns The connection.
 */
export function make_connection_view(overrides: Partial<IConnectionView> = {}): IConnectionView {
  return {
    connection_id: 'conn-1',
    provider: IntegrationProvider.ASSIGNR,
    status: ConnectionStatus.CONNECTED,
    account_label: 'Metro Youth Soccer Assignor',
    last_sync_at: 1_786_234_975_000,
    last_error: null,
    ...overrides,
  };
}

/** A healthy connection. */
export const CONNECTED_CONNECTION: IConnectionView = make_connection_view();

/** A connection the provider stopped accepting. */
export const NEEDS_ATTENTION_CONNECTION: IConnectionView = make_connection_view({
  connection_id: 'conn-2',
  status: ConnectionStatus.NEEDS_ATTENTION,
  account_label: 'County Rec League',
  last_error: 'The provider rejected the stored credentials.',
});

/** A connection the tenant disconnected. */
export const DISCONNECTED_CONNECTION: IConnectionView = make_connection_view({
  connection_id: 'conn-3',
  status: ConnectionStatus.DISCONNECTED,
  account_label: 'Lakeside Futsal Assignor',
  last_sync_at: null,
});

/** One connection in each status. */
export const CONNECTION_FIXTURES: readonly IConnectionView[] = [
  CONNECTED_CONNECTION,
  NEEDS_ATTENTION_CONNECTION,
  DISCONNECTED_CONNECTION,
];
