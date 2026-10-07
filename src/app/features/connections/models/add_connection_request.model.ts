import { IntegrationProvider } from '../enums/integration_provider.enum';

/** Body of `POST /api/connections`. The secret is sent once and never kept. */
export interface IAddConnectionRequest {
  /** Provider to connect. */
  provider: IntegrationProvider;
  /** The tenant's own OAuth client id. */
  client_id: string;
  /** The tenant's own OAuth client secret. */
  client_secret: string;
}
