import { IStoredCredentials } from '../../connections/models/stored_credentials.model.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { AssignrCredentialsRejectedError } from './errors/assignr_credentials_rejected_error.js';

/** Assignr's OAuth token endpoint. */
export const ASSIGNR_TOKEN_URL = 'https://app.assignr.com/oauth/token';

/** An access token with the instant it stops being valid. */
export interface IAssignrAccessToken {
  access_token: string;
  /** UTC milliseconds. */
  expires_at: number;
}

/** Options for the token client; both are injectable for tests. */
export interface IAssignrTokenClientOptions {
  /** Defaults to the global `fetch`, bound so it keeps its required receiver. */
  fetch_impl?: typeof fetch;
  now?: () => number;
  token_url?: string;
}

/** Lifetime assumed when Assignr omits `expires_in` (the docs say about two hours). */
const DEFAULT_LIFETIME_MS = 7_200_000;

/**
 * Requests access tokens from Assignr with the client-credentials grant, which
 * gives access to the credentials' own account. The credentials are sent only in
 * the request body to Assignr's token endpoint and are never logged or put in an
 * error message.
 */
export class AssignrTokenClient {
  private readonly fetch_impl: typeof fetch;
  private readonly now: () => number;
  private readonly token_url: string;

  public constructor(options: IAssignrTokenClientOptions = {}) {
    this.fetch_impl = options.fetch_impl ?? fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.token_url = options.token_url ?? ASSIGNR_TOKEN_URL;
  }

  /**
   * Exchanges client credentials for an access token.
   * @param credentials The client id and secret.
   * @returns The token and when it expires.
   * @throws AssignrCredentialsRejectedError when Assignr says the credentials are not valid (400/401).
   * @throws AssignrApiError for any other failure, including an unusable response.
   */
  public async request_token(credentials: IStoredCredentials): Promise<IAssignrAccessToken> {
    const response = await this.fetch_impl(this.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
      }),
    });

    if (response.status === 400 || response.status === 401) {
      throw new AssignrCredentialsRejectedError();
    }
    if (!response.ok) {
      throw new AssignrApiError(`Assignr token endpoint ${response.status}`, response.status, null);
    }

    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (!body || typeof body.access_token !== 'string' || body.access_token === '') {
      throw new AssignrApiError(
        'Assignr token endpoint returned no access token',
        response.status,
        null,
      );
    }
    const lifetime_ms =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in * 1000
        : DEFAULT_LIFETIME_MS;
    return { access_token: body.access_token, expires_at: this.now() + lifetime_ms };
  }
}
