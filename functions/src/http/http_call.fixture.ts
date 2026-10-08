import type { Express } from 'express';
import request from 'supertest';

/** The request methods the routes specs drive generically. */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/**
 * Starts a supertest request with a method chosen at run time, so one table of routes can drive
 * the same gating checks for every method.
 * @param app The Express app under test.
 * @param method The request method.
 * @param path The request path.
 * @returns The supertest request, ready for headers and a body.
 */
export function http_call(app: Express, method: HttpMethod, path: string): request.Test {
  switch (method) {
    case 'get':
      return request(app).get(path);
    case 'post':
      return request(app).post(path);
    case 'put':
      return request(app).put(path);
    case 'delete':
      return request(app).delete(path);
  }
}
