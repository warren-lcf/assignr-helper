import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;
const EXPIRES_AT = 1_800_000_000_000 + 10 * DAY;

/**
 * Creates a link as the tenant-A owner.
 * @param context The routes app under test.
 * @param body Request body.
 * @returns The supertest response.
 */
function create_link(context: IRoutesApp, body: object = {}) {
  return request(context.app).post('/api/quick_links').set(auth(ROUTE_TOKENS.owner_a)).send(body);
}

describe('POST /api/quick_links', () => {
  it('requires sign-in', async () => {
    const context = make_routes_app();

    expect((await request(context.app).post('/api/quick_links').send({})).status).toBe(401);
    expect(await context.quick_links.list_links('t1')).toEqual([]);
  });

  it('is forbidden to a plain member', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/quick_links')
      .set(auth(ROUTE_TOKENS.member_a))
      .send({});

    expect(response.status).toBe(403);
    expect(await context.quick_links.list_links('t1')).toEqual([]);
  });

  it('is forbidden to an owner viewing as a plain member', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/quick_links')
      .set(auth(ROUTE_TOKENS.owner_a))
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER')
      .send({});

    expect(response.status).toBe(403);
  });

  it('creates a link and returns the token once, with its path, uncached', async () => {
    const context = make_routes_app();

    const response = await create_link(context, {
      scope: {
        organization_ids: ['org-1'],
        levels: ['U12'],
        date_start: Date.UTC(2027, 0, 1),
        date_end: Date.UTC(2027, 0, 31),
      },
      expires_at: EXPIRES_AT,
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { quick_link, token, path } = response.body.data;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(path).toBe(`/q/${token}`);
    expect(quick_link).toEqual({
      link_id: 'ql-1',
      scope: {
        organization_ids: ['org-1'],
        levels: ['U12'],
        date_start: Date.UTC(2027, 0, 1),
        date_end: Date.UTC(2027, 0, 31),
      },
      state: 'ACTIVE',
      expires_at: EXPIRES_AT,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      created_at: context.harness.clock(),
    });
    expect(Object.keys(response.body.data).sort()).toEqual(['path', 'quick_link', 'token']);
  });

  it('stores only the hash of the token', async () => {
    const context = make_routes_app();

    const response = await create_link(context);

    const [stored] = await context.quick_links.list_links('t1');
    expect(stored?.token_hash).toBe(hash_quick_link_token(response.body.data.token));
    expect(JSON.stringify(stored)).not.toContain(response.body.data.token);
  });

  it('defaults an empty body to an unrestricted link that never expires', async () => {
    const context = make_routes_app();

    const response = await create_link(context);

    expect(response.status).toBe(201);
    expect(response.body.data.quick_link).toMatchObject({
      scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
      expires_at: null,
      state: 'ACTIVE',
    });
  });

  it('writes an audit row with both roles and no token or hash', async () => {
    const context = make_routes_app();

    const response = await create_link(context, { expires_at: EXPIRES_AT });

    expect(context.audit.rows).toHaveLength(1);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_type: 'quick_link',
      resource_id: 'ql-1',
      action: 'CREATE',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).not.toContain(response.body.data.token);
    expect(serialized).not.toContain(hash_quick_link_token(response.body.data.token));
  });

  it('records the real and assumed role when a platform administrator acts for a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/quick_links')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_OWNER')
      .send({});

    expect(response.status).toBe(201);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      tenant_id: 't1',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect((await context.quick_links.list_links('t1')).map((link) => link.created_by)).toEqual([
      'u-admin',
    ]);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/quick_links')
      .set(auth(ROUTE_TOKENS.admin))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it.each([
    ['an unknown field', { tenant_id: 't2' }],
    ['an unknown scope field', { scope: { token: 'x' } }],
    [
      'too many organizations',
      { scope: { organization_ids: Array.from({ length: 51 }, (_, i) => `o${i}`) } },
    ],
    ['an organization id with bad characters', { scope: { organization_ids: ['a b'] } }],
    ['a blank level', { scope: { levels: [' '] } }],
    ['a date that is not midnight UTC', { scope: { date_start: Date.UTC(2027, 0, 1) + 5 } }],
    [
      'a reversed date window',
      { scope: { date_start: Date.UTC(2027, 0, 5), date_end: Date.UTC(2027, 0, 1) } },
    ],
    ['an expiry in the past', { expires_at: 1_700_000_000_000 }],
    ['an expiry over 400 days ahead', { expires_at: 1_800_000_000_000 + 401 * DAY }],
    ['an expiry that is text', { expires_at: 'tomorrow' }],
  ])('rejects %s with a 400 and creates nothing', async (_name, body) => {
    const context = make_routes_app();

    const response = await create_link(context, body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.violations.length).toBeGreaterThan(0);
    expect(await context.quick_links.list_links('t1')).toEqual([]);
    expect(context.audit.rows).toHaveLength(0);
  });

  it('answers 500 without leaking the cause when the store fails', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = make_routes_app();
    context.quick_links.create_link = async () => {
      throw new Error('spanner exploded');
    };

    const response = await create_link(context);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('spanner exploded');
    error_spy.mockRestore();
  });
});

describe('GET /api/quick_links', () => {
  it('requires sign-in and the quick_links.manage permission', async () => {
    const context = make_routes_app();

    expect((await request(context.app).get('/api/quick_links')).status).toBe(401);
    expect(
      (await request(context.app).get('/api/quick_links').set(auth(ROUTE_TOKENS.member_a))).status,
    ).toBe(403);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get('/api/quick_links')
      .set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('lists the tenant links newest first and never the token or hash', async () => {
    const context = make_routes_app();
    const first = await create_link(context);
    context.harness.advance(1000);
    const second = await create_link(context);

    const response = await request(context.app)
      .get('/api/quick_links')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.quick_links.map((link: { link_id: string }) => link.link_id)).toEqual(
      ['ql-2', 'ql-1'],
    );
    const serialized = JSON.stringify(response.body);
    for (const created of [first, second]) {
      expect(serialized).not.toContain(created.body.data.token);
      expect(serialized).not.toContain(hash_quick_link_token(created.body.data.token));
    }
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('tenant_id');
  });

  it("lists only the caller's tenant, and a platform administrator sees only the tenant acted in", async () => {
    const context = make_routes_app();
    await create_link(context);
    await request(context.app).post('/api/quick_links').set(auth(ROUTE_TOKENS.owner_b)).send({});

    const as_b = await request(context.app).get('/api/quick_links').set(auth(ROUTE_TOKENS.owner_b));
    const as_admin = await request(context.app)
      .get('/api/quick_links')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't2');

    expect(as_b.body.data.quick_links).toHaveLength(1);
    expect(as_admin.body.data.quick_links).toHaveLength(1);
    expect(await context.quick_links.list_links('t1')).toHaveLength(1);
  });

  it('shows EXPIRED once the expiry has passed', async () => {
    const context = make_routes_app();
    await create_link(context, { expires_at: 1_800_000_000_000 + DAY });
    context.harness.advance(2 * DAY);

    const response = await request(context.app)
      .get('/api/quick_links')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.body.data.quick_links[0].state).toBe('EXPIRED');
  });
});

describe('POST /api/quick_links/:link_id/revoke', () => {
  it('requires sign-in and the quick_links.manage permission', async () => {
    const context = make_routes_app();
    await create_link(context);

    expect((await request(context.app).post('/api/quick_links/ql-1/revoke')).status).toBe(401);
    expect(
      (
        await request(context.app)
          .post('/api/quick_links/ql-1/revoke')
          .set(auth(ROUTE_TOKENS.member_a))
      ).status,
    ).toBe(403);
    expect((await context.quick_links.get_link('t1', 'ql-1'))?.revoked_at).toBeNull();
  });

  it('revokes the link, audits it, and returns no token or hash', async () => {
    const context = make_routes_app();
    const created = await create_link(context);

    const response = await request(context.app)
      .post('/api/quick_links/ql-1/revoke')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.quick_link).toMatchObject({
      link_id: 'ql-1',
      state: 'REVOKED',
      revoked_at: context.harness.clock(),
    });
    expect(Object.keys(response.body.data)).toEqual(['quick_link']);
    expect(JSON.stringify(response.body)).not.toContain(created.body.data.token);
    expect(context.audit.rows).toHaveLength(2);
    expect(context.audit.rows[1]).toMatchObject({
      action: 'UPDATE',
      resource_type: 'quick_link',
      resource_id: 'ql-1',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.stringify(context.audit.rows)).not.toContain(created.body.data.token);
  });

  it('is idempotent and keeps the first revocation time', async () => {
    const context = make_routes_app();
    await create_link(context);
    const first = await request(context.app)
      .post('/api/quick_links/ql-1/revoke')
      .set(auth(ROUTE_TOKENS.owner_a));
    context.harness.advance(5000);

    const second = await request(context.app)
      .post('/api/quick_links/ql-1/revoke')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(second.status).toBe(200);
    expect(second.body.data.quick_link.revoked_at).toBe(first.body.data.quick_link.revoked_at);
    expect(context.audit.rows).toHaveLength(2);
  });

  it('stops the public link from working at once', async () => {
    const context = make_routes_app();
    const created = await create_link(context);
    const url = `/api/public/q/${created.body.data.token}/games`;
    expect((await request(context.app).get(url)).status).toBe(200);

    await request(context.app).post('/api/quick_links/ql-1/revoke').set(auth(ROUTE_TOKENS.owner_a));

    expect((await request(context.app).get(url)).status).toBe(404);
  });

  it('answers 404 for an unknown link', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/quick_links/nope/revoke')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it("answers 404 for another tenant's link and leaves it working", async () => {
    const context = make_routes_app();
    const created = await create_link(context);

    const response = await request(context.app)
      .post('/api/quick_links/ql-1/revoke')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      (
        await request(context.app)
          .post('/api/quick_links/never-existed/revoke')
          .set(auth(ROUTE_TOKENS.owner_b))
      ).body,
    );
    expect((await context.quick_links.get_link('t1', 'ql-1'))?.revoked_at).toBeNull();
    const url = `/api/public/q/${created.body.data.token}/games`;
    expect((await request(context.app).get(url)).status).toBe(200);
  });

  it('answers 400 for a malformed link id', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post(`/api/quick_links/${encodeURIComponent("a' OR 1=1")}/revoke`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();
    await create_link(context);

    const response = await request(context.app)
      .post('/api/quick_links/ql-1/revoke')
      .set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });
});

describe('a created link end to end', () => {
  it('serves the open games of its tenant through its token', async () => {
    const context = make_routes_app();
    await context.harness.games.save_games([
      make_contract_game('t1', 'g1', {
        start_at: context.harness.clock() + 3_600_000,
        local_date: Date.UTC(2027, 0, 16),
        level: 'U12',
      }),
      make_contract_game('t2', 'other', { start_at: context.harness.clock() + 3_600_000 }),
    ]);
    const created = await create_link(context, { scope: { levels: ['U12'] } });

    const response = await request(context.app).get(
      `/api/public/q/${created.body.data.token}/games`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.levels).toEqual(['U12']);
  });
});
