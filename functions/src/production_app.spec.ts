import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_production_app } from './production_app.js';

const ENV = {
  SPANNER_PROJECT_ID: 'p',
  SPANNER_INSTANCE_ID: 'i',
  SPANNER_DATABASE_ID: 'd',
};

describe('create_production_app', () => {
  it.each(['SPANNER_PROJECT_ID', 'SPANNER_INSTANCE_ID', 'SPANNER_DATABASE_ID'])(
    'refuses to start without %s',
    (name) => {
      const env = { ...ENV, [name]: undefined };

      expect(() => create_production_app(env)).toThrow(
        `Missing required environment variable ${name}`,
      );
    },
  );

  it('builds an app that keeps health public and protects everything else', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/health')).status).toBe(200);
    const protected_response = await request(app).get('/api/me');
    expect(protected_response.status).toBe(401);
    expect(protected_response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
