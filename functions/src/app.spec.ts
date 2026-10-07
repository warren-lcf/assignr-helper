import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { create_app } from './app.js';

describe('create_app', () => {
  it('serves the health route', async () => {
    const response = await request(create_app({ now: () => 5 })).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data.checked_at).toBe(5);
  });

  it('returns the standard error envelope for an unknown route', async () => {
    const response = await request(create_app()).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found',
      violations: [],
    });
  });

  it('does not advertise the framework', async () => {
    const response = await request(create_app()).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('hides error detail from the client and logs the real error', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = create_app({
      mount_routes: (target) => {
        target.get('/api/boom', () => {
          throw new Error('secret detail');
        });
      },
    });

    const response = await request(app).get('/api/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
      violations: [],
    });
    expect(JSON.stringify(response.body)).not.toContain('secret detail');
    expect(error_spy).toHaveBeenCalledWith('Unhandled API error', expect.any(Error));
    error_spy.mockRestore();
  });
});
