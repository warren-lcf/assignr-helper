import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { make_connection } from '../sync/make_connection.fixture.js';
import { ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { ConnectionCredentialsRejectedError } from './errors/connection_credentials_rejected.error.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const BODY = { provider: 'ASSIGNR', client_id: 'my-client', client_secret: 'super-secret-value' };

describe('POST /api/connections', () => {
  it('requires sign-in', async () => {
    const { app } = make_routes_app();

    expect((await request(app).post('/api/connections').send(BODY)).status).toBe(401);
  });

  it('is forbidden to a plain member', async () => {
    const { app, vault } = make_routes_app();

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.member_a))
      .send(BODY);

    expect(response.status).toBe(403);
    expect(await vault.read('t1', 'admin-conn-1')).toBeNull();
  });

  it('connects with the tenant credentials and never echoes them', async () => {
    const { app, vault, connections, audit } = make_routes_app();

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(BODY);

    expect(response.status).toBe(201);
    expect(response.body.data.connection).toMatchObject({
      connection_id: 'admin-conn-1',
      provider: 'ASSIGNR',
      status: 'CONNECTED',
      account_label: 'Metro Youth Soccer',
    });
    expect(JSON.stringify(response.body)).not.toContain('super-secret-value');
    expect(await vault.read('t1', 'admin-conn-1')).toEqual({
      client_id: 'my-client',
      client_secret: 'super-secret-value',
    });
    expect(await connections.list_connections('t1')).toHaveLength(1);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      action: 'CREATE',
    });
    expect(JSON.stringify(audit.rows)).not.toContain('super-secret-value');
  });

  it.each([
    ['a missing secret', { provider: 'ASSIGNR', client_id: 'x' }],
    ['an empty client id', { ...BODY, client_id: '   ' }],
    ['an unknown provider', { ...BODY, provider: 'NOPE' }],
    ['an unexpected field', { ...BODY, role: 'ADMIN' }],
  ])('rejects %s with a 400 that does not echo the secret', async (_name, body) => {
    const { app, vault } = make_routes_app();

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('super-secret-value');
    expect(await vault.read('t1', 'admin-conn-1')).toBeNull();
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const { app } = make_routes_app();

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.admin))
      .send(BODY);

    expect(response.status).toBe(400);
  });

  it('answers 422 when the provider rejects the credentials, storing nothing', async () => {
    const { app, verifier, vault } = make_routes_app();
    verifier.verify = async () => {
      throw new ConnectionCredentialsRejectedError();
    };

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(BODY);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('CREDENTIALS_REJECTED');
    expect(JSON.stringify(response.body)).not.toContain('super-secret-value');
    expect(await vault.read('t1', 'admin-conn-1')).toBeNull();
  });

  it('answers 502 when the provider cannot be reached', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, verifier } = make_routes_app();
    verifier.verify = async () => {
      throw new AssignrApiError('down', 503, null);
    };

    const response = await request(app)
      .post('/api/connections')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(BODY);

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
    error_spy.mockRestore();
  });
});

describe('PUT /api/connections/:connection_id/credentials', () => {
  async function seeded() {
    const context = make_routes_app();
    await context.connections.save_connection(make_connection());
    await context.vault.write('t1', 'c1', { client_id: 'old-id', client_secret: 'old' });
    return context;
  }

  it('rotates just the secret, keeping the stored client id', async () => {
    const { app, vault } = await seeded();

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ client_secret: 'rotated-secret' });

    expect(response.status).toBe(200);
    expect(response.body.data.connection.status).toBe('CONNECTED');
    expect(JSON.stringify(response.body)).not.toContain('rotated-secret');
    expect(await vault.read('t1', 'c1')).toEqual({
      client_id: 'old-id',
      client_secret: 'rotated-secret',
    });
  });

  it('is forbidden to a member', async () => {
    const { app } = await seeded();

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.member_a))
      .send({ client_secret: 's' });

    expect(response.status).toBe(403);
  });

  it('cannot touch another tenant connection', async () => {
    const { app, vault } = await seeded();

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ client_secret: 'attacker' });

    expect(response.status).toBe(404);
    expect(await vault.read('t1', 'c1')).toEqual({ client_id: 'old-id', client_secret: 'old' });
  });

  it('requires a secret', async () => {
    const { app } = await seeded();

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({});

    expect(response.status).toBe(400);
  });

  it('asks for a client id when none is stored', async () => {
    const { app, vault } = await seeded();
    await vault.delete('t1', 'c1');

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ client_secret: 's' });

    expect(response.status).toBe(400);
    expect(response.body.violations).toEqual([expect.objectContaining({ path: 'client_id' })]);
  });

  it('answers 409 for credentials of a different account', async () => {
    const { app, verifier } = await seeded();
    verifier.verify = async () => ({ external_account_id: 'other', label: 'Other' });

    const response = await request(app)
      .put('/api/connections/c1/credentials')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ client_secret: 's' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ACCOUNT_MISMATCH');
  });
});

describe('POST /api/connections/:connection_id/test', () => {
  it('reports whether the stored credentials work', async () => {
    const { app, connections, vault } = make_routes_app();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    const response = await request(app)
      .post('/api/connections/c1/test')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ok: true, failure: null });
  });

  it('reports missing credentials', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/test')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.body.data).toEqual({ ok: false, failure: 'NO_CREDENTIALS' });
  });

  it('treats another tenant connection as missing', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/test')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
  });
});

describe('POST /api/connections/:connection_id/disconnect', () => {
  it('removes the stored credentials and marks the connection disconnected', async () => {
    const { app, connections, vault, audit } = make_routes_app();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    const response = await request(app)
      .post('/api/connections/c1/disconnect')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.connection.status).toBe('DISCONNECTED');
    expect(await vault.read('t1', 'c1')).toBeNull();
    expect(audit.rows[0]).toMatchObject({ action: 'DELETE', resource_id: 'c1' });
  });

  it('is forbidden to a member and leaves the credentials alone', async () => {
    const { app, connections, vault } = make_routes_app();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    const response = await request(app)
      .post('/api/connections/c1/disconnect')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(403);
    expect(await vault.read('t1', 'c1')).not.toBeNull();
  });

  it('cannot disconnect another tenant connection', async () => {
    const { app, connections, vault } = make_routes_app();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    const response = await request(app)
      .post('/api/connections/c1/disconnect')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect(await vault.read('t1', 'c1')).not.toBeNull();
  });
});
