import { ConnectionCredentialsRejectedError } from '../../connections/errors/connection_credentials_rejected.error.js';
import { IStoredCredentials } from '../../connections/models/stored_credentials.model.js';
import { IVerifiedAccount } from '../../connections/models/verified_account.model.js';
import { IAccountVerifier } from '../../connections/ports/account_verifier.interface.js';
import { IntegrationProvider } from '../enums/integration_provider.enum.js';
import { AssignrHttpClient } from './assignr_http_client.js';
import { AssignrRateBudget } from './assignr_rate_budget.js';
import { AssignrTokenClient } from './assignr_token_client.js';
import { AssignrAuthError } from './errors/assignr_auth_error.js';
import { AssignrCredentialsRejectedError } from './errors/assignr_credentials_rejected_error.js';

/** Dependencies of the verifier; every one is injectable for tests. */
export interface IAssignrAccountVerifierOptions {
  token_client?: AssignrTokenClient;
  fetch_impl?: typeof fetch;
}

/**
 * Checks Assignr credentials by really using them: it requests a token, then reads
 * the account the token belongs to. This is what tells a typo from a working
 * credential before anything is saved, and tells us which account it is.
 */
export class AssignrAccountVerifier implements IAccountVerifier {
  private readonly token_client: AssignrTokenClient;
  private readonly fetch_impl: typeof fetch | undefined;

  public constructor(options: IAssignrAccountVerifierOptions = {}) {
    this.fetch_impl = options.fetch_impl;
    this.token_client =
      options.token_client ?? new AssignrTokenClient({ fetch_impl: this.fetch_impl });
  }

  /** @inheritdoc */
  public async verify(
    provider: IntegrationProvider,
    credentials: IStoredCredentials,
  ): Promise<IVerifiedAccount> {
    if (provider !== IntegrationProvider.ASSIGNR) {
      throw new Error(`Unsupported provider for this verifier: ${provider}`);
    }
    try {
      const token = await this.token_client.request_token(credentials);
      const http_client = new AssignrHttpClient({
        rate_budget: new AssignrRateBudget(),
        fetch_impl: this.fetch_impl,
      });
      const body = (await http_client.get_json('/current_account', token.access_token)) as Record<
        string,
        unknown
      > | null;
      return this.to_account(body);
    } catch (error) {
      if (error instanceof AssignrCredentialsRejectedError || error instanceof AssignrAuthError) {
        throw new ConnectionCredentialsRejectedError();
      }
      throw error;
    }
  }

  private to_account(body: Record<string, unknown> | null): IVerifiedAccount {
    const id = body?.['id'];
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new Error('Assignr returned an account without an id');
    }
    const full_name = [body?.['first_name'], body?.['last_name']]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(' ');
    const named = [body?.['name'], full_name, body?.['login']].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '',
    );
    return { external_account_id: String(id), label: named?.trim() ?? null };
  }
}
