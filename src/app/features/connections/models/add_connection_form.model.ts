import { IntegrationProvider } from '../enums/integration_provider.enum';

/** What the add-connection form edits. The secret lives here only while the dialog is open. */
export interface IAddConnectionFormModel {
  /** Provider to connect. */
  provider: IntegrationProvider;
  /** The OAuth client id. */
  client_id: string;
  /** The OAuth client secret; write-only, cleared as soon as it is sent. */
  client_secret: string;
}
