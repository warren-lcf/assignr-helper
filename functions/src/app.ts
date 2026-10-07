import express, { Express, NextFunction, Request, Response } from 'express';
import './auth/express_request_auth.augmentation.js';
import { IAppAuth } from './auth/models/app_auth.model.js';
import { create_me_router } from './auth/me.routes.js';
import { create_health_router } from './health/health.routes.js';

/** Dependencies injected into the Express app so specs can swap them. */
export interface ICreateAppOptions {
  /** Clock returning the current instant in UTC milliseconds. */
  now?: () => number;
  /** Mounts public routes (no sign-in) ahead of the auth middleware. */
  mount_routes?: (app: Express) => void;
  /**
   * Auth for everything else. When omitted, no protected route is served at all
   * (the app fails closed rather than exposing handlers without a caller).
   */
  auth?: IAppAuth;
  /** Mounts protected routes after the auth middleware; only called when `auth` is set. */
  mount_protected_routes?: (app: Express, auth: IAppAuth) => void;
}

/**
 * Builds the Express application served by the single HTTPS function.
 * Firebase's `onRequest` already parses request bodies, so no JSON parser is
 * mounted here. Order matters: public routers, then the auth middleware, then
 * protected routers.
 * @param options Injected dependencies.
 * @returns The configured Express app.
 */
export function create_app(options: ICreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', create_health_router(options.now));
  options.mount_routes?.(app);

  if (options.auth) {
    app.use('/api', options.auth.middleware);
    app.use('/api', create_me_router(options.auth.permission_service));
    options.mount_protected_routes?.(app, options.auth);
  }

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
