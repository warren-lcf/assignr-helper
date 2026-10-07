import type { Express } from 'express';
import { create_app } from './app.js';
import { create_connections_admin_router } from './connections/connections_admin.routes.js';
import { create_connections_router } from './connections/connections.routes.js';
import { create_games_router } from './games/games.routes.js';
import { create_production_context } from './production_context.js';
import { create_sync_router } from './sync/sync.routes.js';

/**
 * Builds the real application: public health route, then the auth middleware,
 * then the protected routes (who am I, connections, games, sync). Throws at start-up
 * when the environment is incomplete.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The Express app served by the HTTPS function.
 */
export function create_production_app(env: NodeJS.ProcessEnv = process.env): Express {
  const context = create_production_context(env);
  return create_app({
    auth: context.auth,
    mount_protected_routes: (app) => {
      app.use(
        '/api',
        create_connections_router(context.connections, context.auth.permission_service),
      );
      app.use(
        '/api',
        create_connections_admin_router({
          admin_service: context.admin_service,
          permission_service: context.auth.permission_service,
        }),
      );
      app.use(
        '/api',
        create_games_router({
          games_service: context.games_service,
          permission_service: context.auth.permission_service,
        }),
      );
      app.use(
        '/api',
        create_sync_router({
          sync_service: context.sync_service,
          connections: context.connections,
          runs: context.sync_runs,
          permission_service: context.auth.permission_service,
        }),
      );
    },
  });
}
