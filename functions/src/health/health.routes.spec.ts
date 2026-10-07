import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_health_router } from './health.routes.js';

describe('create_health_router', () => {
  it('reports ok with the injected clock', async () => {
    const app = express();
    app.use(
      '/api',
      create_health_router(() => 1786234975000),
    );

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok', checked_at: 1786234975000 } });
  });
});
