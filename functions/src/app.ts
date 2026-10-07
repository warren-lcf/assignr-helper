import express, { Express, NextFunction, Request, Response } from 'express';
import { create_health_router } from './health/health.routes.js';

/** Dependencies injected into the Express app so specs can swap them. */
export interface ICreateAppOptions {
  /** Clock returning the current instant in UTC milliseconds. */
  now?: () => number;
  /** Mounts additional routes ahead of the 404 and error handlers. */
  mount_routes?: (app: Express) => void;
}

/**
 * Builds the Express application served by the single HTTPS function.
 * Firebase's `onRequest` already parses request bodies, so no JSON parser is
 * mounted here. Public routers mount before the auth middleware once it exists.
 * @param options Injected dependencies.
 * @returns The configured Express app.
 */
export function create_app(options: ICreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', create_health_router(options.now));
  options.mount_routes?.(app);

  app.use((_request: Request, response: Response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'Route not found', violations: [] });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error('Unhandled API error', error);
    response
      .status(500)
      .json({ code: 'INTERNAL_ERROR', message: 'Unexpected server error', violations: [] });
  });

  return app;
}
