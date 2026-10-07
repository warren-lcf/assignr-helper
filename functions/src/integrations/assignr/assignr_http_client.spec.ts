import { describe, expect, it, vi } from 'vitest';
import { AssignrHttpClient } from './assignr_http_client.js';
import { AssignrRateBudget } from './assignr_rate_budget.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { AssignrAuthError } from './errors/assignr_auth_error.js';
import { AssignrConflictError } from './errors/assignr_conflict_error.js';
import { AssignrRateLimitError } from './errors/assignr_rate_limit_error.js';

function json_response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function make_client(responses: Response[], max_retries = 3) {
  const fetch_impl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next;
  });
  const slept: number[] = [];
  let clock = 1;
  const client = new AssignrHttpClient({
    rate_budget: new AssignrRateBudget({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    }),
    fetch_impl: fetch_impl as unknown as typeof fetch,
    sleep: async (ms) => {
      slept.push(ms);
    },
    max_retries,
  });
  return { client, fetch_impl, slept };
}

describe('AssignrHttpClient', () => {
  it('sends bearer auth and the HAL accept header and returns parsed JSON', async () => {
    const { client, fetch_impl } = make_client([json_response({ ok: true })]);

    const result = await client.get_json('/current_account', 'tok', { 'search[status]': 'active' });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetch_impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.assignr.com/api/v2/current_account?search%5Bstatus%5D=active');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.assignr.v2.hal+json',
    });
  });

  it('posts form-encoded bodies and tolerates an empty response body', async () => {
    const { client, fetch_impl } = make_client([json_response(null, 201)]);

    const result = await client.post_form('/assignments/9/confirm', 'tok', { status: 'A' });

    expect(result).toBeNull();
    const [, init] = fetch_impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.body as URLSearchParams).get('status')).toBe('A');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
  });

  it('returns raw text when the body is not JSON', async () => {
    const { client } = make_client([new Response('plain', { status: 200 })]);

    expect(await client.get_json('/x', 'tok')).toBe('plain');
  });

  it('follows absolute HAL links on the same host but refuses other hosts', async () => {
    const { client, fetch_impl } = make_client([json_response({})]);

    await client.get_json('https://api.assignr.com/api/v2/games?page=2', 'tok');
    expect(fetch_impl).toHaveBeenCalledTimes(1);

    await expect(client.get_json('https://evil.example.com/steal', 'tok')).rejects.toThrow(
      /Refusing to call a host/,
    );
    expect(fetch_impl).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 using the reset header, then succeeds', async () => {
    const { client, slept } = make_client([
      json_response({}, 429, { 'x-ratelimit-reset-seconds-remaining': '7' }),
      json_response({ done: true }),
    ]);

    expect(await client.get_json('/x', 'tok')).toEqual({ done: true });
    expect(slept).toEqual([7000]);
  });

  it('retries a 503 with exponential backoff', async () => {
    const { client, slept } = make_client([
      json_response({}, 503),
      json_response({}, 503),
      json_response({ ok: 1 }),
    ]);

    await client.get_json('/x', 'tok');

    expect(slept).toEqual([1000, 2000]);
  });

  it('throws a rate-limit error after retries are exhausted', async () => {
    const { client } = make_client([json_response({}, 429), json_response({}, 429)], 1);

    await expect(client.get_json('/x', 'tok')).rejects.toBeInstanceOf(AssignrRateLimitError);
  });

  it('maps 401 and 409 to typed errors carrying the body message', async () => {
    const auth = make_client([json_response({ message: 'expired' }, 401)]);
    await expect(auth.client.get_json('/x', 'tok')).rejects.toBeInstanceOf(AssignrAuthError);

    const conflict = make_client([json_response({ error: 'stale lock_version' }, 409)]);
    const error = await conflict.client
      .post_form('/x', 'tok', {})
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AssignrConflictError);
    expect((error as Error).message).toContain('stale lock_version');
  });

  it('wraps other failures in AssignrApiError with status and body', async () => {
    const { client } = make_client([json_response({ message: 'nope' }, 403)]);

    const error = (await client
      .get_json('/x', 'tok')
      .catch((caught: unknown) => caught)) as AssignrApiError;

    expect(error).toBeInstanceOf(AssignrApiError);
    expect(error.status).toBe(403);
    expect(error.body).toEqual({ message: 'nope' });
  });

  it('handles an error response with a non-object body', async () => {
    const { client } = make_client([new Response('gateway down', { status: 502 })]);

    const error = (await client
      .get_json('/x', 'tok')
      .catch((caught: unknown) => caught)) as AssignrApiError;

    expect(error.message).toBe('Assignr API 502');
  });
});
