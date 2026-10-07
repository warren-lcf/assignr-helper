import { IntegrationProvider } from '../enums/integration_provider.enum';

/** English label (also the translation key) for each provider. */
export const INTEGRATION_PROVIDER_LABEL: Readonly<Record<IntegrationProvider, string>> = {
  [IntegrationProvider.ASSIGNR]: 'Assignr',
};
