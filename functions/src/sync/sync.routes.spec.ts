import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACTING_TENANT_HEADER } from '../auth/create_auth_middleware.js';
import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { make_connection } from './make_connection.fixture.js';
import { ROUTE_TOKENS, make_routes_app } from './make_routes_app.fixture.js';
import { SyncKind } from './enums/sync_kind.enum.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('POST /api/connections/:connection_id/sync', () => {
  it('requires sign-in', async () => {
    const { app } = make_routes_app();

    expect((await request(app).post('/api/connections/c1/sync')).status).toBe(401);
  });

  it('refuses a role without the sync.run permission', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_REQUIRED');
  });

  it('runs the sync for the caller tenant and returns each run without internal fields', async () => {
    const { app, connections, harness } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({});

    expect(response.status).toBe(200);
    const runs = response.body.data.runs as Record<string, unknown>[];
    expect(runs.map((run) => run['kind'])).toEqual([
      SyncKind.REFERENCE_DATA,
      SyncKind.OPEN_GAMES,
      SyncKind.MY_GAMES,
    ]);
    for (const run of runs) {
      expect(run).not.toHaveProperty('tenant_id');
      expect(run).not.toHaveProperty('created_by');
    }
    expect(harness.provider.calls).toContain('list_open_games');
    const stored = await connections.get_connection('t1', 'c1');
    expect(stored?.updated_by).toBe('u-owner-a');
  });

  it('accepts a request with no body and an explicit reference refresh', async () => {
    const { app, connections, harness } = make_routes_app();
    await connections.save_connection(make_connection());
    await request(app).post('/api/connections/c1/sync').set(auth(ROUTE_TOKENS.owner_a));
    harness.provider.calls.length = 0;

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ refresh_reference_data: true });

    expect(response.status).toBe(200);
    expect(harness.provider.calls).toContain('list_organizations');
  });

  it('treats another tenant connection as not found', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection({ tenant_id: 't1' }));

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('answers 409 for a connection that needs reconnecting', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(
      make_connection({ status: ConnectionStatus.NEEDS_ATTENTION }),
    );

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONNECTION_NOT_SYNCABLE');
  });

  it.each([
    ['an invalid connection id', '/api/connections/bad%20id/sync', {}],
    ['an unknown body field', '/api/connections/c1/sync', { force: true }],
    ['a wrong body type', '/api/connections/c1/sync', { refresh_reference_data: 'yes' }],
  ])('answers 400 with violations for %s', async (_label, path, body) => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app).post(path).set(auth(ROUTE_TOKENS.owner_a)).send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.violations.length).toBeGreaterThan(0);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('lets a platform administrator sync while acting as the tenant, stamping their real identity', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    const response = await request(app)
      .post('/api/connections/c1/sync')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1');

    expect(response.status).toBe(200);
    expect((await connections.get_connection('t1', 'c1'))?.updated_by).toBe('u-admin');
  });
});

describe('GET /api/connections/:connection_id/sync-runs', () => {
  it('lists the connection runs newest first, and a member may read them', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());
    await request(app).post('/api/connections/c1/sync').set(auth(ROUTE_TOKENS.owner_a));

    const response = await request(app)
      .get('/api/connections/c1/sync-runs')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    const started: number[] = response.body.data.runs.map(
      (run: { started_at: number }) => run.started_at,
    );
    expect(started.length).toBe(3);
    expect(started).toEqual([...started].sort((a, b) => b - a));
  });

  it('honours the limit', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());
    await request(app).post('/api/connections/c1/sync').set(auth(ROUTE_TOKENS.owner_a));

    const response = await request(app)
      .get('/api/connections/c1/sync-runs?limit=2')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.body.data.runs).toHaveLength(2);
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'extra=1'])(
    'answers 400 for the query %s',
    async (query) => {
      const { app, connections } = make_routes_app();
      await connections.save_connection(make_connection());

      const response = await request(app)
        .get(`/api/connections/c1/sync-runs?${query}`)
        .set(auth(ROUTE_TOKENS.owner_a));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    },
  );

  it('answers 404 for an unknown connection and for another tenant', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection());

    expect(
      (await request(app).get('/api/connections/nope/sync-runs').set(auth(ROUTE_TOKENS.owner_a)))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/connections/c1/sync-runs').set(auth(ROUTE_TOKENS.owner_b)))
        .status,
    ).toBe(404);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const { app } = make_routes_app();

    const response = await request(app)
      .get('/api/connections/c1/sync-runs')
      .set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });
});
