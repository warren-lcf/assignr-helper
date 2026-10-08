import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_production_app } from './production_app.js';

const ENV = {
  SPANNER_PROJECT_ID: 'p',
  SPANNER_INSTANCE_ID: 'i',
  SPANNER_DATABASE_ID: 'd',
  SECRET_MANAGER_PROJECT_ID: 'sm',
  PUBLIC_APP_ORIGIN: 'https://app.example.test',
};

describe('create_production_app', () => {
  it.each([
    'SPANNER_PROJECT_ID',
    'SPANNER_INSTANCE_ID',
    'SPANNER_DATABASE_ID',
    'SECRET_MANAGER_PROJECT_ID',
    'PUBLIC_APP_ORIGIN',
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

  it('protects the quick link management routes', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).post('/api/quick_links').send({})).status).toBe(401);
    expect((await request(app).get('/api/quick_links')).status).toBe(401);
    expect((await request(app).post('/api/quick_links/l1/revoke')).status).toBe(401);
  });

  it('refuses to start with a PUBLIC_APP_ORIGIN that is not a bare https origin', () => {
    for (const bad of ['http://app.example.test', 'https://app.example.test/app', 'nonsense']) {
      expect(() => create_production_app({ ...ENV, PUBLIC_APP_ORIGIN: bad })).toThrow(
        'PUBLIC_APP_ORIGIN',
      );
    }
  });

  it('protects the contact routes', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/contacts')).status).toBe(401);
    expect((await request(app).post('/api/contacts').send({})).status).toBe(401);
    expect((await request(app).post('/api/contacts/import').send({})).status).toBe(401);
    expect((await request(app).delete('/api/contacts/c1')).status).toBe(401);
  });

  it('protects the email settings routes', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/email/settings')).status).toBe(401);
    expect((await request(app).put('/api/email/settings').send({})).status).toBe(401);
    expect((await request(app).delete('/api/email/settings')).status).toBe(401);
  });

  it('protects every email draft route', async () => {
    const app = create_production_app(ENV);

    expect((await request(app).get('/api/email_drafts')).status).toBe(401);
    expect((await request(app).post('/api/email_drafts').send({})).status).toBe(401);
    expect((await request(app).get('/api/email_drafts/d1')).status).toBe(401);
    expect((await request(app).put('/api/email_drafts/d1').send({})).status).toBe(401);
    expect((await request(app).delete('/api/email_drafts/d1')).status).toBe(401);
    expect((await request(app).get('/api/email_drafts/d1/preview')).status).toBe(401);
    expect((await request(app).post('/api/email_drafts/d1/test_send')).status).toBe(401);
    expect(
      (await request(app).post('/api/email_drafts/d1/send').send({ confirm_recipient_count: 1 }))
        .status,
    ).toBe(401);
  });

  it('serves the public unsubscribe route without sign-in, answering a garbage token with the uniform 404', async () => {
    const app = create_production_app(ENV);

    for (const response of [
      await request(app).get('/api/public/unsubscribe/not-a-real-token'),
      await request(app).post('/api/public/unsubscribe/not-a-real-token'),
      await request(app).get(`/api/public/unsubscribe/${'A'.repeat(120)}`),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'This link is not available' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('rate limits repeated bad unsubscribe tokens from one client', async () => {
    const app = create_production_app(ENV);

    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await request(app).post('/api/public/unsubscribe/garbage')).status);
    }

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(404));
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it('serves the public quick link route without sign-in, refusing a garbage token like any other', async () => {
    const app = create_production_app(ENV);

    const response = await request(app).get('/api/public/q/not-a-real-token/games');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'This link is not available' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rate limits repeated bad tokens from one client', async () => {
    const app = create_production_app(ENV);

    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await request(app).get('/api/public/q/garbage/games')).status);
    }

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(404));
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it('limits by the address the trusted proxies report, not the one the client claims', async () => {
    const app = create_production_app({ ...ENV, TRUSTED_PROXY_HOPS: '2' });
    const as = (xff: string) =>
      request(app).get('/api/public/q/garbage/games').set('X-Forwarded-For', xff);
    for (let i = 0; i < 20; i++) await as(`${i}.0.0.1, 203.0.113.5, 198.51.100.1`);

    expect((await as('9.9.9.9, 203.0.113.5, 198.51.100.1')).status).toBe(429);
    expect((await as('9.9.9.9, 203.0.113.6, 198.51.100.1')).status).toBe(404);
  });

  it('refuses to start with an invalid TRUSTED_PROXY_HOPS', () => {
    expect(() => create_production_app({ ...ENV, TRUSTED_PROXY_HOPS: 'many' })).toThrow(
      'TRUSTED_PROXY_HOPS',
    );
  });
});
