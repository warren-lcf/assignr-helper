import request from 'supertest';
import { http_call, type HttpMethod } from '../http/http_call.fixture.js';
import { describe, expect, it } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const API_KEY = 'SG.very-secret-key-123';

const VALID = {
  api_key: API_KEY,
  from_email: 'Desk@Example.com',
  from_name: 'Metro Referee Desk',
  reply_to: 'reply@example.com',
  postal_address: '1 Main St\nSpringfield, VA 22150',
};

/**
 * Saves settings as the tenant-A owner.
 * @param context The routes app under test.
 * @param body Request body.
 * @returns The supertest request.
 */
function save_settings(context: IRoutesApp, body: object = VALID) {
  return request(context.app).put('/api/email/settings').set(auth(ROUTE_TOKENS.owner_a)).send(body);
}

describe('permission and tenant gating', () => {
  const routes: [HttpMethod, object | undefined][] = [
    ['get', undefined],
    ['put', VALID],
    ['delete', undefined],
  ];

  it.each(routes)('%s requires sign-in', async (method, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, '/api/email/settings');

    expect((await (body ? call.send(body) : call)).status).toBe(401);
  });

  it.each(routes)('%s is forbidden to a plain member', async (method, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, '/api/email/settings').set(
      auth(ROUTE_TOKENS.member_a),
    );

    expect((await (body ? call.send(body) : call)).status).toBe(403);
    expect(await context.email_settings.read('t1')).toBeNull();
  });

  it('is forbidden to an owner viewing as a plain member', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_a))
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER')
      .send(VALID);

    expect(response.status).toBe(403);
    expect(await context.email_settings.read('t1')).toBeNull();
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get('/api/email/settings')
      .set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('lets a platform administrator act for a tenant and records both roles', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .send(VALID);

    expect(response.status).toBe(200);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      tenant_id: 't1',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'PLATFORM_ADMIN',
    });
    expect(await context.email_settings.read('t1')).not.toBeNull();
  });

  it('keeps each tenant settings and key to itself', async () => {
    const context = make_routes_app();
    await save_settings(context);

    const other = await request(context.app)
      .get('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_b));
    await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ ...VALID, api_key: 'SG.tenant-b-key', from_email: 'b@example.org' });

    expect(other.body.data.settings.configured).toBe(false);
    expect((await context.email_settings.read('t1'))?.api_key).toBe(API_KEY);
    expect((await context.email_settings.read('t2'))?.api_key).toBe('SG.tenant-b-key');
  });
});

describe('GET /api/email/settings', () => {
  it('shows an unconfigured tenant with nothing set', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        settings: {
          configured: false,
          from_email: null,
          from_name: null,
          reply_to: null,
          postal_address: null,
        },
      },
    });
  });

  it('shows the saved settings and never the API key, and is not cacheable', async () => {
    const context = make_routes_app();
    await save_settings(context);

    const response = await request(context.app)
      .get('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.body.data.settings).toEqual({
      configured: true,
      from_email: 'desk@example.com',
      from_name: 'Metro Referee Desk',
      reply_to: 'reply@example.com',
      postal_address: '1 Main St\nSpringfield, VA 22150',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(JSON.stringify(response.body)).not.toContain('api_key');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('PUT /api/email/settings', () => {
  it('saves the settings, normalising the addresses, and answers without the key', async () => {
    const context = make_routes_app();

    const response = await save_settings(context);

    expect(response.status).toBe(200);
    expect(response.body.data.settings).toMatchObject({
      configured: true,
      from_email: 'desk@example.com',
    });
    expect(JSON.stringify(response.body)).not.toContain(API_KEY);
    expect(await context.email_settings.read('t1')).toEqual({
      api_key: API_KEY,
      from_email: 'desk@example.com',
      from_name: 'Metro Referee Desk',
      reply_to: 'reply@example.com',
      postal_address: '1 Main St\nSpringfield, VA 22150',
    });
  });

  it('needs an API key the first time', async () => {
    const context = make_routes_app();

    const response = await save_settings(context, { from_email: 'desk@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.violations).toEqual([
      { path: 'api_key', message: 'Required until email sending is configured' },
    ]);
    expect(await context.email_settings.read('t1')).toBeNull();
    expect(context.audit.rows).toHaveLength(0);
  });

  it('keeps the stored key when the API key is omitted, and clears omitted optional fields', async () => {
    const context = make_routes_app();
    await save_settings(context);

    const response = await save_settings(context, { from_email: 'new@example.com' });

    expect(response.status).toBe(200);
    expect(await context.email_settings.read('t1')).toEqual({
      api_key: API_KEY,
      from_email: 'new@example.com',
      from_name: null,
      reply_to: null,
      postal_address: null,
    });
    expect(response.body.data.settings.from_name).toBeNull();
  });

  it('replaces the key when a new one is given', async () => {
    const context = make_routes_app();
    await save_settings(context);

    await save_settings(context, { ...VALID, api_key: 'SG.rotated' });

    expect((await context.email_settings.read('t1'))?.api_key).toBe('SG.rotated');
  });

  it('treats blank optional fields as none', async () => {
    const context = make_routes_app();

    await save_settings(context, {
      api_key: API_KEY,
      from_email: 'desk@example.com',
      from_name: '  ',
      reply_to: null,
      postal_address: '',
    });

    expect(await context.email_settings.read('t1')).toMatchObject({
      from_name: null,
      reply_to: null,
      postal_address: null,
    });
  });

  it.each([
    ['an unknown field', { tenant_id: 't2' }],
    ['a missing sender', { from_email: undefined }],
    ['an invalid sender', { from_email: 'nope' }],
    ['a header injection in the sender', { from_email: 'a@example.com\r\nBcc: evil@example.com' }],
    ['an invalid reply-to', { reply_to: 'not an address' }],
    ['a line break in the sender name', { from_name: 'Desk\nBcc: evil@example.com' }],
    ['a sender name over 100 characters', { from_name: 'x'.repeat(101) }],
    ['a postal address over 300 characters', { postal_address: 'x'.repeat(301) }],
    ['a control character in the postal address', { postal_address: 'Main St\u0000' }],
    ['an API key with a space', { api_key: 'SG.has space' }],
    ['an API key with a line break', { api_key: 'SG.key\nX-Evil: 1' }],
    ['an empty API key', { api_key: '   ' }],
    ['an API key over 512 characters', { api_key: 'k'.repeat(513) }],
    ['a non-text API key', { api_key: 5 }],
  ])('answers 400, never 500, and saves nothing for %s', async (_label, patch) => {
    const context = make_routes_app();

    const response = await save_settings(context, { ...VALID, ...patch });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(API_KEY);
    expect(await context.email_settings.read('t1')).toBeNull();
  });

  it('audits the change with a masked sender, flags and never the key or full addresses', async () => {
    const context = make_routes_app();

    await save_settings(context);
    await save_settings(context, { from_email: 'desk@example.com' });
    await save_settings(context, { from_email: 'desk@example.com', api_key: 'SG.rotated-key-999' });

    expect(context.audit.rows).toHaveLength(3);
    expect(context.audit.rows.map((row) => row.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_type: 'email_settings',
      resource_id: 't1',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('SG.');
    expect(serialized).not.toContain('rotated-key');
    expect(serialized).not.toContain('desk@example.com');
    expect(serialized).not.toContain('reply@example.com');
    expect(serialized).not.toContain('Springfield');
    expect(serialized).toContain('d***@e***.com');
    const after = context.audit.rows.map((row) => JSON.parse(row.after_state_json ?? 'null'));
    expect(after.map((state) => state.provider_key_changed)).toEqual([true, false, true]);
  });

  it('does not leak the key into the error handler when saving fails', async () => {
    const context = make_routes_app();
    context.email_settings.write = async () => {
      throw new Error('vault down');
    };
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const response = await save_settings(context);

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(API_KEY);
      expect(JSON.stringify(errors)).not.toContain(API_KEY);
    } finally {
      console.error = original;
    }
  });
});

describe('DELETE /api/email/settings', () => {
  it('removes the settings and the key', async () => {
    const context = make_routes_app();
    await save_settings(context);

    const response = await request(context.app)
      .delete('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.settings).toEqual({
      configured: false,
      from_email: null,
      from_name: null,
      reply_to: null,
      postal_address: null,
    });
    expect(await context.email_settings.read('t1')).toBeNull();
    expect(context.audit.rows.map((row) => row.action)).toEqual(['CREATE', 'DELETE']);
    expect(JSON.stringify(context.audit.rows)).not.toContain(API_KEY);
  });

  it('succeeds when nothing is configured and writes no audit row', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .delete('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.settings.configured).toBe(false);
    expect(context.audit.rows).toHaveLength(0);
  });

  it('does not remove another tenant settings', async () => {
    const context = make_routes_app();
    await save_settings(context);

    await request(context.app).delete('/api/email/settings').set(auth(ROUTE_TOKENS.owner_b));

    expect(await context.email_settings.read('t1')).not.toBeNull();
  });
});
