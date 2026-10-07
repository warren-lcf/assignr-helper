import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { make_connection } from '../sync/make_connection.fixture.js';
import { ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /api/connections', () => {
  it('requires sign-in', async () => {
    const { app } = make_routes_app();

    expect((await request(app).get('/api/connections')).status).toBe(401);
  });

  it('lists only the caller tenant connections, never where credentials live', async () => {
    const { app, connections } = make_routes_app();
    await connections.save_connection(make_connection({ connection_id: 'a', account_label: 'A' }));
    await connections.save_connection(
      make_connection({ tenant_id: 't2', connection_id: 'b', account_label: 'B' }),
    );

    const response = await request(app).get('/api/connections').set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.connections).toEqual([
      {
        connection_id: 'a',
        provider: 'ASSIGNR',
        status: 'CONNECTED',
        account_label: 'A',
        last_sync_at: null,
        last_error: null,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('secret/never-exposed');
  });

  it('lets a member read the list', async () => {
    const { app } = make_routes_app();

    const response = await request(app).get('/api/connections').set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(response.body.data.connections).toEqual([]);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const { app } = make_routes_app();

    const response = await request(app).get('/api/connections').set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });
});
