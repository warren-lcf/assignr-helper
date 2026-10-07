import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_production_app } from './production_app.js';

const ENV = {
  SPANNER_PROJECT_ID: 'p',
  SPANNER_INSTANCE_ID: 'i',
  SPANNER_DATABASE_ID: 'd',
  SECRET_MANAGER_PROJECT_ID: 'sm',
};

describe('create_production_app', () => {
  it.each([
    'SPANNER_PROJECT_ID',
    'SPANNER_INSTANCE_ID',
    'SPANNER_DATABASE_ID',
    'SECRET_MANAGER_PROJECT_ID',
  ])('refuses to start without %s', (name) => {
    const env = { ...ENV, [name]: undefined };

    expect(() => create_production_app(env)).toThrow(
      `Missing required environment variable ${name}`,
    );
  });

  it('builds an app that keeps health public and protects everything else', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/health')).status).toBe(200);
    const protected_response = await request(app).get('/api/me');
    expect(protected_response.status).toBe(401);
    expect(protected_response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('protects the connection and sync routes too', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/connections')).status).toBe(401);
    expect((await request(app).post('/api/connections/c1/sync')).status).toBe(401);
    expect((await request(app).get('/api/connections/c1/sync-runs')).status).toBe(401);
  });

  it('protects the games list', async () => {
    const app = create_production_app(ENV);

    const response = await request(app).get('/api/games');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('protects the credential admin routes', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).post('/api/connections').send({})).status).toBe(401);
    expect((await request(app).put('/api/connections/c1/credentials').send({})).status).toBe(401);
    expect((await request(app).post('/api/connections/c1/test')).status).toBe(401);
    expect((await request(app).post('/api/connections/c1/disconnect')).status).toBe(401);
  });
});
