import { describe, expect, it, vi } from 'vitest';
import { AssignrTokenClient } from './assignr_token_client.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { AssignrCredentialsRejectedError } from './errors/assignr_credentials_rejected_error.js';

const CREDENTIALS = { client_id: 'the-client-id', client_secret: 'the-client-secret' };

function make_client(response: Response) {
  const fetch_impl = vi.fn(async () => response);
  const client = new AssignrTokenClient({
    fetch_impl: fetch_impl as unknown as typeof fetch,
    now: () => 1_000,
  });
  return { client, fetch_impl };
}

describe('AssignrTokenClient', () => {
  it('requests a client-credentials token and computes its expiry', async () => {
    const { client, fetch_impl } = make_client(
      Response.json({ access_token: 'tok', token_type: 'Bearer', expires_in: 7200 }),
    );

    const token = await client.request_token(CREDENTIALS);

    expect(token).toEqual({ access_token: 'tok', expires_at: 1_000 + 7_200_000 });
    const [url, init] = fetch_impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.assignr.com/oauth/token');
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('the-client-id');
    expect(body.get('client_secret')).toBe('the-client-secret');
  });

  it('falls back to a two hour lifetime when expires_in is missing', async () => {
    const { client } = make_client(Response.json({ access_token: 'tok' }));

    expect((await client.request_token(CREDENTIALS)).expires_at).toBe(1_000 + 7_200_000);
  });

  it.each([400, 401])('reports status %s as rejected credentials', async (status) => {
    const { client } = make_client(new Response('{"error":"invalid_client"}', { status }));

    await expect(client.request_token(CREDENTIALS)).rejects.toBeInstanceOf(
      AssignrCredentialsRejectedError,
    );
  });

  it('never puts the credentials in an error message', async () => {
    const rejected = make_client(new Response('{}', { status: 401 }));
    const failed = make_client(new Response('boom', { status: 503 }));

    const messages = [
      await rejected.client.request_token(CREDENTIALS).catch((error: Error) => error.message),
      await failed.client.request_token(CREDENTIALS).catch((error: Error) => error.message),
    ];

    for (const message of messages) {
      expect(message).not.toContain('the-client-secret');
      expect(message).not.toContain('the-client-id');
    }
  });

  it('wraps other failures as an API error with the status', async () => {
    const { client } = make_client(new Response('boom', { status: 503 }));

    const error = (await client
      .request_token(CREDENTIALS)
      .catch((caught: unknown) => caught)) as AssignrApiError;

    expect(error).toBeInstanceOf(AssignrApiError);
    expect(error).not.toBeInstanceOf(AssignrCredentialsRejectedError);
    expect(error.status).toBe(503);
  });

  it.each([
    ['not json', new Response('<html>', { status: 200 })],
    ['no token', Response.json({ token_type: 'Bearer' })],
    ['an empty token', Response.json({ access_token: '' })],
  ])('rejects a success response with %s', async (_label, response) => {
    const { client } = make_client(response);

    await expect(client.request_token(CREDENTIALS)).rejects.toThrow(/returned no access token/);
  });
});
