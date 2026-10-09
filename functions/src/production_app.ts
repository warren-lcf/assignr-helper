import type { Express } from 'express';
import { create_app } from './app.js';
import { read_trusted_proxy_hops } from './config/read_trusted_proxy_hops.js';
import { CALENDAR_FEED_LIMITS } from './calendar_feed/calendar_feed_limits.constant.js';
import { create_calendar_feed_router } from './calendar_feed/calendar_feed.routes.js';
import { create_public_calendar_feed_router } from './calendar_feed/public_calendar_feed.routes.js';
import { create_connections_admin_router } from './connections/connections_admin.routes.js';
import { create_contacts_router } from './contacts/contacts.routes.js';
import { create_email_drafts_router } from './email_drafts/email_drafts.routes.js';
import { create_email_settings_router } from './email_settings/email_settings.routes.js';
import { create_connections_router } from './connections/connections.routes.js';
import { create_games_router } from './games/games.routes.js';
import { create_match_reports_router } from './match_reports/match_reports.routes.js';
import { TokenBucketRateLimiter } from './http/rate_limit/token_bucket_rate_limiter.js';
import { create_production_context } from './production_context.js';
import { create_public_quick_links_router } from './quick_links/public_quick_links.routes.js';
import { create_quick_links_router } from './quick_links/quick_links.routes.js';
import { create_public_unsubscribe_router } from './unsubscribe/public_unsubscribe.routes.js';
import { create_sync_router } from './sync/sync.routes.js';

/**
 * Builds the real application: public routes (health, the quick-link games behind a token, the
 * calendar feed behind a token, and the unsubscribe link behind a signed token), then the auth
 * middleware, then the protected routes (who am I, connections, games, match reports, sync,
 * quick-link management, the calendar feed link, contacts, email settings and email drafts).
 * Throws at start-up when the environment is incomplete.
 *
 * Public rate limits are per client address and per function instance, separately for quick
 * links and for unsubscribe links: 60 requests a minute for any request, and a stricter 20 a
 * minute for requests whose token opens nothing. The calendar feed allows 600 requests a minute
 * per address because calendar providers fetch for many people from shared addresses, while its
 * failed lookups stay at 20 a minute. Test emails are limited to a burst of 5 and
 * then one every two minutes per tenant and user. The
 * address comes from `X-Forwarded-For` trusting `TRUSTED_PROXY_HOPS` proxies (see
 * `read_trusted_proxy_hops`). Counters are in memory, so the limits are not shared across
 * instances (upstream issue #794 tracks a shared store).
 * @param env Environment to read; defaults to `process.env`.
 * @returns The Express app served by the HTTPS function.
 */
export function create_production_app(env: NodeJS.ProcessEnv = process.env): Express {
  const context = create_production_context(env);
  const make_limiter = (per_minute: number): TokenBucketRateLimiter =>
    new TokenBucketRateLimiter({
      capacity: per_minute,
      refill_per_minute: per_minute,
      max_keys: 10_000,
      now: Date.now,
    });
  return create_app({
    trust_proxy_hops: read_trusted_proxy_hops(env),
    mount_routes: (app) => {
      app.use(
        '/api',
        create_public_quick_links_router({
          service: context.public_quick_link_service,
          request_limiter: make_limiter(60),
          failure_limiter: make_limiter(20),
        }),
      );
      app.use(
        '/api',
        create_public_calendar_feed_router({
          service: context.public_calendar_feed_service,
          request_limiter: make_limiter(CALENDAR_FEED_LIMITS.REQUESTS_PER_MINUTE_PER_IP),
          failure_limiter: make_limiter(CALENDAR_FEED_LIMITS.FAILED_LOOKUPS_PER_MINUTE_PER_IP),
        }),
      );
      app.use(
        '/api',
        create_public_unsubscribe_router({
          service: context.unsubscribe_service,
          request_limiter: make_limiter(60),
          failure_limiter: make_limiter(20),
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
        create_match_reports_router({
          report_service: context.match_report_service,
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
        create_calendar_feed_router({
          feed_service: context.calendar_feed_admin_service,
          permission_service: context.auth.permission_service,
        }),
      );
      app.use(
        '/api',
        create_contacts_router({
          contact_service: context.contact_service,
          permission_service: context.auth.permission_service,
        }),
      );
      app.use(
        '/api',
        create_email_settings_router({
          settings_service: context.email_settings_service,
          permission_service: context.auth.permission_service,
        }),
      );
      app.use(
        '/api',
        create_email_drafts_router({
          draft_service: context.email_draft_service,
          preview_service: context.email_preview_service,
          send_service: context.email_send_service,
          permission_service: context.auth.permission_service,
          test_send_limiter: new TokenBucketRateLimiter({
            capacity: 5,
            refill_per_minute: 0.5,
            max_keys: 10_000,
            now: Date.now,
          }),
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
