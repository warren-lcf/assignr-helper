import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { make_contract_contact } from '../contacts/stores/contracts/make_contract_contact.js';
import { sign_unsubscribe_token } from '../domain/unsubscribe/sign_unsubscribe_token.js';
import { TokenBucketRateLimiter } from '../http/rate_limit/token_bucket_rate_limiter.js';
import { IRoutesApp, make_routes_app } from '../sync/make_routes_app.fixture.js';

const NOT_AVAILABLE = { code: 'NOT_FOUND', message: 'This link is not available' };
const PUBLIC_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};

/**
 * Asserts the four headers every public response carries.
 * @param headers Response headers.
 * @returns Nothing.
 */
function expect_public_headers(headers: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(PUBLIC_HEADERS)) {
    expect(headers[name]).toBe(value);
  }
}

/**
 * Seeds a contact of tenant `t1` and makes its unsubscribe token.
 * @param context The routes app under test.
 * @param contact_id Primary key of the contact.
 * @returns The token.
 */
async function seed_contact_token(context: IRoutesApp, contact_id = 'c1'): Promise<string> {
  await context.contacts.create_contact(
    make_contract_contact('t1', contact_id, { email_address: 'samantha@example.com' }),
  );
  return context.unsubscribe.issue_token('t1', contact_id);
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

describe('GET /api/public/unsubscribe/:token', () => {
  it('shows a masked address and whether the contact has unsubscribed, with the public headers', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);

    const response = await request(context.app).get(`/api/public/unsubscribe/${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { email_masked: 's***@e***.com', already_unsubscribed: false },
    });
    expect(JSON.stringify(response.body)).not.toContain('samantha');
    expect_public_headers(response.headers);
  });

  it('has no side effects, however many times a mail scanner opens it', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    const before = await context.contacts.get_contact('t1', 'c1');

    for (let i = 0; i < 5; i++) {
      await request(context.app).get(`/api/public/unsubscribe/${token}`);
    }

    expect(await context.contacts.get_contact('t1', 'c1')).toEqual(before);
    expect(context.audit.rows).toEqual([]);
  });

  it('says so once the contact has unsubscribed', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    await request(context.app).post(`/api/public/unsubscribe/${token}`);

    const response = await request(context.app).get(`/api/public/unsubscribe/${token}`);

    expect(response.body.data.already_unsubscribed).toBe(true);
  });
});

describe('POST /api/public/unsubscribe/:token', () => {
  it('unsubscribes the contact, with the public headers', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);

    const response = await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { unsubscribed: true } });
    expect_public_headers(response.headers);
    expect(await context.contacts.get_contact('t1', 'c1')).toMatchObject({
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: context.harness.clock(),
      consent_updated_at: context.harness.clock(),
      updated_by: 'system:public-unsubscribe',
    });
  });

  it('is idempotent: repeating it changes nothing and writes no second audit row', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    await request(context.app).post(`/api/public/unsubscribe/${token}`);
    const after_first = await context.contacts.get_contact('t1', 'c1');

    const again = await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ data: { unsubscribed: true } });
    expect(await context.contacts.get_contact('t1', 'c1')).toEqual(after_first);
    expect(context.audit.rows).toHaveLength(1);
  });

  it('audits the change as the system with a masked address', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);

    await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'system:public-unsubscribe',
      tenant_id: 't1',
      resource_type: 'contact',
      resource_id: 'c1',
      action: 'UPDATE',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).toContain('s***@e***.com');
    expect(serialized).not.toContain('samantha');
    expect(serialized).not.toContain(token);
  });

  it('only affects the contact of the tenant the token names', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    await context.contacts.create_contact(
      make_contract_contact('t2', 'c1', { email_address: 'other@example.org' }),
    );

    await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect((await context.contacts.get_contact('t1', 'c1'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
    expect((await context.contacts.get_contact('t2', 'c1'))?.consent_status).toBe(
      ConsentStatus.GRANTED,
    );
  });

  it('cannot be undone through any API: the contact stays unsubscribed', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    await request(context.app).post(`/api/public/unsubscribe/${token}`);

    const re_add = await request(context.app)
      .post('/api/contacts')
      .set({ Authorization: 'Bearer owner-a' })
      .send({
        display_name: 'Again',
        email_address: 'samantha@example.com',
        consent_attested: true,
      });

    expect(re_add.status).toBe(409);
    expect((await context.contacts.get_contact('t1', 'c1'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
  });
});

describe('tokens that cannot be used', () => {
  /**
   * Builds tokens that are well formed but must be refused, and tokens that are not well formed.
   * @param context The routes app under test.
   * @returns Labelled tokens.
   */
  async function unusable_tokens(context: IRoutesApp): Promise<[string, string][]> {
    const good = await seed_contact_token(context);
    const bytes = Buffer.from(good, 'base64url');
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] ^= 0xff;
    const other_version = Buffer.from(bytes);
    other_version[0] = 2;
    return [
      ['too short', 'abc'],
      ['wrong characters', `${'A'.repeat(60)}!`],
      ['path-like', '..%2F..%2Fetc%2Fpasswd'],
      ['padded base64', `${good}=`],
      ['right shape, random bytes', randomBytes(80).toString('base64url')],
      ['altered tag', flipped.toString('base64url')],
      ['unknown key version', other_version.toString('base64url')],
      [
        'signed with another key',
        sign_unsubscribe_token({ tenant_id: 't1', contact_id: 'c1' }, 1, randomBytes(32)),
      ],
      [
        'valid but for a contact that does not exist',
        await context.unsubscribe.issue_token('t1', 'ghost'),
      ],
      [
        'valid but for a tenant without that contact',
        await context.unsubscribe.issue_token('t2', 'c1'),
      ],
    ];
  }

  it('answers every one with the same 404 body and the public headers, for GET and POST', async () => {
    const context = make_routes_app();
    for (const [label, token] of await unusable_tokens(context)) {
      for (const method of ['get', 'post'] as const) {
        const response = await request(context.app)[method](`/api/public/unsubscribe/${token}`);

        expect([label, response.status, response.body]).toEqual([label, 404, NOT_AVAILABLE]);
        expect_public_headers(response.headers);
      }
    }
  });

  it('changes nothing when a token is refused', async () => {
    const context = make_routes_app();
    const tokens = await unusable_tokens(context);
    const before = await context.contacts.get_contact('t1', 'c1');

    for (const [, token] of tokens) {
      await request(context.app).post(`/api/public/unsubscribe/${token}`);
    }

    expect(await context.contacts.get_contact('t1', 'c1')).toEqual(before);
    expect(context.audit.rows).toEqual([]);
  });

  it('does not touch the key store for a token that is not even well formed', async () => {
    const context = make_routes_app();
    const read = vi.spyOn(context.unsubscribe_secrets, 'read');

    await request(context.app).get('/api/public/unsubscribe/garbage');
    await request(context.app).post(`/api/public/unsubscribe/${'A'.repeat(100)}`);

    expect(read).not.toHaveBeenCalled();
  });

  it('answers 503, not a guess, when the signing key cannot be read', async () => {
    const context = make_routes_app();
    const token = await seed_contact_token(context);
    // The key has not been loaded yet in this app, so the next read of the store fails.
    const fresh = make_routes_app();
    vi.spyOn(fresh.unsubscribe_secrets, 'read').mockRejectedValue(new Error('permission denied'));

    const response = await request(fresh.app).post(`/api/public/unsubscribe/${token}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('UNSUBSCRIBE_KEY_UNAVAILABLE');
    expect(response.body.message).toContain('temporarily unavailable');
    expect(context.audit.rows).toEqual([]);
  });
});

describe('rate limiting', () => {
  it('limits every request from one client', async () => {
    const context = make_routes_app({
      unsubscribe_request_limiter: new TokenBucketRateLimiter({
        capacity: 3,
        refill_per_minute: 1,
        max_keys: 10,
        now: () => 1_800_000_000_000,
      }),
    });
    const token = await seed_contact_token(context);

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await request(context.app).get(`/api/public/unsubscribe/${token}`)).status);
    }
    const limited = await request(context.app).get(`/api/public/unsubscribe/${token}`);

    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect_public_headers(limited.headers);
  });

  it('throttles token guessing harder, and refuses even a good token while throttled', async () => {
    const context = make_routes_app({
      unsubscribe_failure_limiter: new TokenBucketRateLimiter({
        capacity: 2,
        refill_per_minute: 1,
        max_keys: 10,
        now: () => 1_800_000_000_000,
      }),
    });
    const token = await seed_contact_token(context);

    const bad = [
      await request(context.app).post('/api/public/unsubscribe/garbage'),
      await request(context.app).post('/api/public/unsubscribe/garbage'),
      await request(context.app).post('/api/public/unsubscribe/garbage'),
    ];
    const good = await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect(bad.map((r) => r.status)).toEqual([404, 404, 429]);
    expect(good.status).toBe(429);
    expect(good.headers['retry-after']).toBeDefined();
    expect((await context.contacts.get_contact('t1', 'c1'))?.consent_status).toBe(
      ConsentStatus.GRANTED,
    );
  });

  it('does not count successful requests against the guessing limit', async () => {
    const context = make_routes_app({
      unsubscribe_failure_limiter: new TokenBucketRateLimiter({
        capacity: 1,
        refill_per_minute: 1,
        max_keys: 10,
        now: () => 1_800_000_000_000,
      }),
    });
    const token = await seed_contact_token(context);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await request(context.app).get(`/api/public/unsubscribe/${token}`)).status);
    }

    expect(statuses).toEqual([200, 200, 200, 200]);
  });
});
