import type { Express } from 'express';
import { create_app } from './app.js';
import { read_trusted_proxy_hops } from './config/read_trusted_proxy_hops.js';
import { create_connections_admin_router } from './connections/connections_admin.routes.js';
import { create_connections_router } from './connections/connections.routes.js';
import { create_games_router } from './games/games.routes.js';
import { TokenBucketRateLimiter } from './http/rate_limit/token_bucket_rate_limiter.js';
import { create_production_context } from './production_context.js';
import { create_public_quick_links_router } from './quick_links/public_quick_links.routes.js';
import { create_quick_links_router } from './quick_links/quick_links.routes.js';
import { create_sync_router } from './sync/sync.routes.js';

/**
 * Builds the real application: public routes (health, and the quick-link games behind a
 * token), then the auth middleware, then the protected routes (who am I, connections, games,
 * sync, quick-link management). Throws at start-up when the environment is incomplete.
 *
 * Quick-link rate limits are per client address and per function instance: 60 requests a minute
 * for any request, and a stricter 20 a minute for requests whose token opens nothing. The
 * address comes from `X-Forwarded-For` trusting `TRUSTED_PROXY_HOPS` proxies (see
 * `read_trusted_proxy_hops`). Counters are in memory, so the limits are not shared across
 * instances (upstream issue #794 tracks a shared store).
 * @param env Environment to read; defaults to `process.env`.
 * @returns The Express app served by the HTTPS function.
 */
export function create_production_app(env: NodeJS.ProcessEnv = process.env): Express {
  const context = create_production_context(env);
  return create_app({
    trust_proxy_hops: read_trusted_proxy_hops(env),
    mount_routes: (app) => {
      app.use(
        '/api',
        create_public_quick_links_router({
          service: context.public_quick_link_service,
          request_limiter: new TokenBucketRateLimiter({
            capacity: 60,
            refill_per_minute: 60,
            max_keys: 10_000,
            now: Date.now,
          }),
          failure_limiter: new TokenBucketRateLimiter({
            capacity: 20,
            refill_per_minute: 20,
            max_keys: 10_000,
            now: Date.now,
          }),
        }),
      );
    },
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
        create_quick_links_router({
          quick_link_service: context.quick_link_service,
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
