import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';
import { IStoredCredentials } from '../models/stored_credentials.model.js';
import { IVerifiedAccount } from '../models/verified_account.model.js';

/** Port that checks a set of credentials against the provider and says whose they are. */
export interface IAccountVerifier {
  /**
   * Verifies credentials by using them.
   * @param provider Which provider the credentials are for.
   * @param credentials The credentials to try.
   * @returns The account they belong to.
   * @throws ConnectionCredentialsRejectedError when the provider rejects them.
   * @throws Error when the provider could not be reached (the caller may retry).
   */
  verify(provider: IntegrationProvider, credentials: IStoredCredentials): Promise<IVerifiedAccount>;
}
