import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';

/** What a tenant enters to connect a provider account. */
export interface IConnectionCredentialsInput {
  provider: IntegrationProvider;
  client_id: string;
  client_secret: string;
}
