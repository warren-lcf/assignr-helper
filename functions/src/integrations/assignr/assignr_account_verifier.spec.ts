import { describe, expect, it, vi } from 'vitest';
import { ConnectionCredentialsRejectedError } from '../../connections/errors/connection_credentials_rejected.error.js';
import { IntegrationProvider } from '../enums/integration_provider.enum.js';
import { AssignrAccountVerifier } from './assignr_account_verifier.js';
import { AssignrTokenClient } from './assignr_token_client.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { AssignrCredentialsRejectedError } from './errors/assignr_credentials_rejected_error.js';

const CREDENTIALS = { client_id: 'id', client_secret: 'secret' };

function make_verifier(options: {
  token?: () => Promise<{ access_token: string; expires_at: number }>;
  account?: () => Response;
}) {
  const request_token = vi.fn(
    options.token ?? (async () => ({ access_token: 'tok', expires_at: 9e12 })),
  );
  const fetch_impl = vi.fn(async () =>
    options.account ? options.account() : Response.json({ id: 42 }),
  );
  const verifier = new AssignrAccountVerifier({
    token_client: { request_token } as unknown as AssignrTokenClient,
    fetch_impl: fetch_impl as unknown as typeof fetch,
  });
  return { verifier, request_token, fetch_impl };
}

describe('AssignrAccountVerifier', () => {
  it('uses the credentials, reads the account with the token, and returns who it is', async () => {
    const { verifier, request_token, fetch_impl } = make_verifier({
      account: () => Response.json({ id: 42, first_name: 'Alex', last_name: 'Referee' }),
    });

    const account = await verifier.verify(IntegrationProvider.ASSIGNR, CREDENTIALS);

    expect(account).toEqual({ external_account_id: '42', label: 'Alex Referee' });
    expect(request_token).toHaveBeenCalledWith(CREDENTIALS);
    const [url, init] = fetch_impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.assignr.com/api/v2/current_account');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it.each([
    ['name', { id: 1, name: 'Metro Ref' }, 'Metro Ref'],
    ['login', { id: 2, login: 'alex@example.test' }, 'alex@example.test'],
    ['nothing', { id: '3' }, null],
  ])('labels the account from %s', async (_source, body, label) => {
    const { verifier } = make_verifier({ account: () => Response.json(body) });

    expect((await verifier.verify(IntegrationProvider.ASSIGNR, CREDENTIALS)).label).toBe(label);
  });

  it('reports rejected credentials as such, without leaking them', async () => {
    const { verifier } = make_verifier({
      token: async () => {
        throw new AssignrCredentialsRejectedError();
      },
    });

    const error = await verifier
      .verify(IntegrationProvider.ASSIGNR, CREDENTIALS)
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(ConnectionCredentialsRejectedError);
    expect((error as Error).message).not.toContain('secret');
  });

  it('also treats a 401 on the account read as rejected credentials', async () => {
    const { verifier } = make_verifier({ account: () => new Response('{}', { status: 401 }) });

    await expect(verifier.verify(IntegrationProvider.ASSIGNR, CREDENTIALS)).rejects.toBeInstanceOf(
      ConnectionCredentialsRejectedError,
    );
  });

  it('lets a provider outage through as an API error so callers can say "try again"', async () => {
    const { verifier } = make_verifier({ account: () => new Response('down', { status: 500 }) });

    await expect(verifier.verify(IntegrationProvider.ASSIGNR, CREDENTIALS)).rejects.toBeInstanceOf(
      AssignrApiError,
    );
  });

  it('refuses a response without an account id', async () => {
    const { verifier } = make_verifier({ account: () => Response.json({ name: 'No id' }) });

    await expect(verifier.verify(IntegrationProvider.ASSIGNR, CREDENTIALS)).rejects.toThrow(
      /without an id/,
    );
  });

  it('refuses a provider it does not handle', async () => {
    const { verifier } = make_verifier({});

    await expect(verifier.verify('OTHER' as IntegrationProvider, CREDENTIALS)).rejects.toThrow(
      /Unsupported provider/,
    );
  });
});
