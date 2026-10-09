import { hash_bearer_token } from '@hch-shared-libraries/core-server';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { ROLE_DEFINITIONS } from '../auth/constants/role_definitions.constant.js';
import { AppRole } from '../auth/enums/app_role.enum.js';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { HttpMethod, http_call } from '../http/http_call.fixture.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Creates the feed as the tenant-A owner.
 * @param context The routes app under test.
 * @returns The supertest response.
 */
function create_feed(context: IRoutesApp) {
  return request(context.app).post('/api/my_schedule/feed').set(auth(ROUTE_TOKENS.owner_a));
}

/**
 * Rotates the feed as the tenant-A owner.
 * @param context The routes app under test.
 * @returns The supertest response.
 */
function rotate_feed(context: IRoutesApp) {
  return request(context.app).post('/api/my_schedule/feed/rotate').set(auth(ROUTE_TOKENS.owner_a));
}

/**
 * Fetches the public feed with a token.
 * @param context The routes app under test.
 * @param token The token (without the extension).
 * @returns The supertest request.
 */
function fetch_public(context: IRoutesApp, token: string) {
  return request(context.app).get(`/api/public/cal/${token}.ics`);
}

const OWNER_ROUTES: [HttpMethod, string][] = [
  ['get', '/api/my_schedule/feed'],
  ['post', '/api/my_schedule/feed'],
  ['post', '/api/my_schedule/feed/rotate'],
  ['delete', '/api/my_schedule/feed'],
];

describe('the permission for managing the calendar feed', () => {
  it('belongs to the tenant owner and the platform administrator, not to members', () => {
    const grants = (role: AppRole) =>
      ROLE_DEFINITIONS.find((definition) => definition.role === role)?.permissions.includes(
        PermissionKey.CALENDAR_FEED_MANAGE,
      );

    expect(PermissionKey.CALENDAR_FEED_MANAGE).toBe('calendar_feed.manage');
    expect(grants(AppRole.TENANT_OWNER)).toBe(true);
    expect(grants(AppRole.PLATFORM_ADMIN)).toBe(true);
    expect(grants(AppRole.TENANT_MEMBER)).toBe(false);
  });
});

describe.each(OWNER_ROUTES)('%s %s', (method, path) => {
  it('requires sign-in', async () => {
    const context = make_routes_app();

    expect((await http_call(context.app, method, path)).status).toBe(401);
    expect(await context.calendar_feeds.get_feed('t1')).toBeNull();
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await http_call(context.app, method, path).set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('is uncacheable', async () => {
    const context = make_routes_app();
    await create_feed(context);

    const response = await http_call(context.app, method, path).set(auth(ROUTE_TOKENS.owner_a));

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/my_schedule/feed', () => {
  it('says there is no feed yet', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { feed: null } });
  });

  it('lets a plain member read the status', async () => {
    const context = make_routes_app();
    await create_feed(context);

    const response = await request(context.app)
      .get('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(response.body.data.feed.status).toBe('ACTIVE');
  });

  it('shows exactly the documented view and never the token, hash or tenant', async () => {
    const context = make_routes_app();
    const created = await create_feed(context);
    await fetch_public(context, created.body.data.token);

    const response = await request(context.app)
      .get('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.body).toEqual({
      data: {
        feed: {
          status: 'ACTIVE',
          created_at: created.body.data.feed.created_at,
          last_fetched_at: context.harness.clock(),
          fetch_count: 1,
          rotation_count: 0,
        },
      },
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(created.body.data.token);
    expect(serialized).not.toContain(hash_bearer_token(created.body.data.token));
  });

  it("does not show another tenant's feed", async () => {
    const context = make_routes_app();
    await create_feed(context);

    const response = await request(context.app)
      .get('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.body).toEqual({ data: { feed: null } });
  });

  it('lets a platform administrator read a tenant they act in', async () => {
    const context = make_routes_app();
    await create_feed(context);

    const response = await request(context.app)
      .get('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1');

    expect(response.status).toBe(200);
    expect(response.body.data.feed.status).toBe('ACTIVE');
  });
});

describe('POST /api/my_schedule/feed', () => {
  it('is forbidden to a plain member', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(403);
    expect(await context.calendar_feeds.get_feed('t1')).toBeNull();
  });

  it('is forbidden to an owner viewing as a plain member', async () => {
    const context = make_routes_app();

    const response = await create_feed(context).set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER');

    expect(response.status).toBe(403);
    expect(await context.calendar_feeds.get_feed('t1')).toBeNull();
  });

  it('creates the feed and returns the token and its path exactly once, uncached', async () => {
    const context = make_routes_app();

    const response = await create_feed(context);

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body)).toEqual(['data']);
    expect(Object.keys(response.body.data).sort()).toEqual(['feed', 'path', 'token']);
    const { feed, token, path } = response.body.data;
    expect(token).toMatch(TOKEN_PATTERN);
    expect(path).toBe(`/api/public/cal/${token}.ics`);
    expect(feed).toEqual({
      status: 'ACTIVE',
      created_at: expect.any(Number),
      last_fetched_at: null,
      fetch_count: 0,
      rotation_count: 0,
    });
  });

  it('stores only the hash of the token', async () => {
    const context = make_routes_app();

    const response = await create_feed(context);

    const stored = await context.calendar_feeds.get_feed('t1');
    expect(stored?.token_hash).toBe(hash_bearer_token(response.body.data.token));
    expect(JSON.stringify(stored)).not.toContain(response.body.data.token);
  });

  it('stamps the real user on the row', async () => {
    const context = make_routes_app();

    await create_feed(context);

    expect(await context.calendar_feeds.get_feed('t1')).toMatchObject({
      created_by: 'u-owner-a',
      updated_by: 'u-owner-a',
    });
  });

  it('answers 409 FEED_EXISTS for a second create, leaving the first link working and revealing nothing', async () => {
    const context = make_routes_app();
    const first = await create_feed(context);

    const second = await create_feed(context);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('FEED_EXISTS');
    expect(second.body.violations).toEqual([]);
    expect(JSON.stringify(second.body)).not.toContain(first.body.data.token);
    expect((await fetch_public(context, first.body.data.token)).status).toBe(200);
  });

  it('lets exactly one of two simultaneous creates win', async () => {
    const context = make_routes_app();

    const [a, b] = await Promise.all([create_feed(context), create_feed(context)]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(context.audit.rows.filter((row) => row.resource_type === 'calendar_feed')).toHaveLength(
      1,
    );
  });

  it('writes an audit row with both roles and no token or hash', async () => {
    const context = make_routes_app();

    const response = await create_feed(context);

    expect(context.audit.rows).toHaveLength(1);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_type: 'calendar_feed',
      resource_id: 't1',
      action: 'CREATE',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).not.toContain(response.body.data.token);
    expect(serialized).not.toContain(hash_bearer_token(response.body.data.token));
  });

  it('records the real and assumed role when a platform administrator acts for a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_OWNER');

    expect(response.status).toBe(201);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      tenant_id: 't1',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect((await context.calendar_feeds.get_feed('t1'))?.created_by).toBe('u-admin');
  });

  it('keeps tenants apart: each tenant gets its own feed and token', async () => {
    const context = make_routes_app();
    const a = await create_feed(context);

    const b = await request(context.app)
      .post('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(b.status).toBe(201);
    expect(b.body.data.token).not.toBe(a.body.data.token);
    expect(
      await context.calendar_feeds.find_subscriber_by_token_hash(
        hash_bearer_token(a.body.data.token),
      ),
    ).toBe('t1');
    expect(
      await context.calendar_feeds.find_subscriber_by_token_hash(
        hash_bearer_token(b.body.data.token),
      ),
    ).toBe('t2');
  });

  it('never logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const context = make_routes_app();

    const response = await create_feed(context);
    await create_feed(context);

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(response.body.data.token);
      spy.mockRestore();
    }
  });
});

describe('POST /api/my_schedule/feed/rotate', () => {
  it('is forbidden to a plain member', async () => {
    const context = make_routes_app();
    await create_feed(context);

    const response = await request(context.app)
      .post('/api/my_schedule/feed/rotate')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(403);
    expect((await context.calendar_feeds.get_feed('t1'))?.rotation_count).toBe(0);
  });

  it('answers 404 NOT_FOUND when there is no feed, creating none', async () => {
    const context = make_routes_app();

    const response = await rotate_feed(context);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(await context.calendar_feeds.get_feed('t1')).toBeNull();
  });

  it('returns a new token and path, counts the rotation, and stops the old token in the same write', async () => {
    const context = make_routes_app();
    const created = await create_feed(context);

    const rotated = await rotate_feed(context);

    expect(rotated.status).toBe(200);
    expect(rotated.headers['cache-control']).toBe('no-store');
    expect(Object.keys(rotated.body.data).sort()).toEqual(['feed', 'path', 'token']);
    const { token, path, feed } = rotated.body.data;
    expect(token).toMatch(TOKEN_PATTERN);
    expect(token).not.toBe(created.body.data.token);
    expect(path).toBe(`/api/public/cal/${token}.ics`);
    expect(feed).toMatchObject({
      status: 'ACTIVE',
      rotation_count: 1,
      fetch_count: 0,
      last_fetched_at: null,
    });
    expect((await fetch_public(context, created.body.data.token)).status).toBe(404);
    expect((await fetch_public(context, token)).status).toBe(200);
  });

  it('counts every rotation', async () => {
    const context = make_routes_app();
    await create_feed(context);

    await rotate_feed(context);
    const third = await rotate_feed(context);

    expect(third.body.data.feed.rotation_count).toBe(2);
  });

  it('writes a KEY_RESET audit row showing the count before and after, without any token', async () => {
    const context = make_routes_app();
    await create_feed(context);

    const rotated = await rotate_feed(context);

    const row = context.audit.rows[1];
    expect(row).toMatchObject({
      resource_type: 'calendar_feed',
      resource_id: 't1',
      action: 'KEY_RESET',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.parse(String(row?.before_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 0,
    });
    expect(JSON.parse(String(row?.after_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 1,
    });
    expect(JSON.stringify(context.audit.rows)).not.toContain(rotated.body.data.token);
  });

  it("does not rotate another tenant's feed", async () => {
    const context = make_routes_app();
    const created = await create_feed(context);

    const response = await request(context.app)
      .post('/api/my_schedule/feed/rotate')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect((await fetch_public(context, created.body.data.token)).status).toBe(200);
  });
});

describe('DELETE /api/my_schedule/feed', () => {
  it('is forbidden to a plain member', async () => {
    const context = make_routes_app();
    const created = await create_feed(context);

    const response = await request(context.app)
      .delete('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(403);
    expect((await fetch_public(context, created.body.data.token)).status).toBe(200);
  });

  it('switches the feed off at once and says there is no feed', async () => {
    const context = make_routes_app();
    const created = await create_feed(context);

    const response = await request(context.app)
      .delete('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { feed: null } });
    expect((await fetch_public(context, created.body.data.token)).status).toBe(404);
    expect(await context.calendar_feeds.get_feed('t1')).toBeNull();
  });

  it('is idempotent and writes the audit row only once', async () => {
    const context = make_routes_app();
    await create_feed(context);
    const delete_feed = () =>
      request(context.app).delete('/api/my_schedule/feed').set(auth(ROUTE_TOKENS.owner_a));

    const first = await delete_feed();
    const second = await delete_feed();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ data: { feed: null } });
    const rows = context.audit.rows.filter((row) => row.action === 'DELETE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      resource_type: 'calendar_feed',
      resource_id: 't1',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
      after_state_json: null,
    });
    expect(JSON.parse(String(rows[0]?.before_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 0,
    });
  });

  it('succeeds for a tenant that never had a feed', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .delete('/api/my_schedule/feed')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(context.audit.rows).toHaveLength(0);
  });

  it("does not switch off another tenant's feed", async () => {
    const context = make_routes_app();
    const created = await create_feed(context);

    await request(context.app).delete('/api/my_schedule/feed').set(auth(ROUTE_TOKENS.owner_b));

    expect((await fetch_public(context, created.body.data.token)).status).toBe(200);
  });

  it('allows a new feed afterwards', async () => {
    const context = make_routes_app();
    await create_feed(context);
    await request(context.app).delete('/api/my_schedule/feed').set(auth(ROUTE_TOKENS.owner_a));

    const again = await create_feed(context);

    expect(again.status).toBe(201);
    expect(again.body.data.feed.rotation_count).toBe(0);
  });
});
