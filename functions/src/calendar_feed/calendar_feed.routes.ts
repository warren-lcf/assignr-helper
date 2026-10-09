import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { to_acting_user } from '../http/to_acting_user.js';
import { CalendarFeedAdminService } from './calendar_feed_admin.service.js';
import { CalendarFeedExistsError } from './errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from './errors/calendar_feed_not_found.error.js';
import { to_feed_view } from './views/to_feed_view.js';

/** Dependencies of the calendar feed owner routes. */
export interface ICalendarFeedRoutesOptions {
  feed_service: CalendarFeedAdminService;
  permission_service: RolePermissionService;
}

/** Where a subscriber's calendar app fetches the feed; the token fills the placeholder. */
const FEED_PATH_PREFIX = '/api/public/cal/';

/**
 * Builds the routes a tenant uses to manage the "My Schedule" calendar subscription link. Mount
 * after the auth middleware. The token appears in exactly two responses, the ones that create or
 * rotate the link; every response is uncacheable.
 * @openapi
 * /api/my_schedule/feed:
 *   get:
 *     summary: The tenant's calendar feed status
 *     description: Never includes the token or its hash.
 *     responses:
 *       200: { description: "data.feed: status, created_at, last_fetched_at, fetch_count, rotation_count, or null when there is no feed." }
 *       400: { description: No tenant to act in. }
 *       403: { description: Requires the games.read permission. }
 *   post:
 *     summary: Create the calendar feed link
 *     description: >
 *       Returns the feed and its token once; only a hash of the token is stored, so the token can
 *       never be shown again.
 *     responses:
 *       201: { description: "data.feed, data.token and data.path (/api/public/cal/<token>.ics)." }
 *       400: { description: No tenant to act in. }
 *       403: { description: Requires the calendar_feed.manage permission. }
 *       409: { description: FEED_EXISTS. The tenant already has a feed, rotate it instead. }
 *   delete:
 *     summary: Switch the calendar feed off
 *     description: Idempotent. The link stops working at once.
 *     responses:
 *       200: { description: "data.feed is null." }
 * /api/my_schedule/feed/rotate:
 *   post:
 *     summary: Replace the calendar feed link
 *     description: The old link stops working in the same write. The new token is shown once.
 *     responses:
 *       200: { description: "data.feed, data.token and data.path." }
 *       404: { description: The tenant has no feed. }
 * @param options Service and permission resolver.
 * @returns An Express router.
 */
export function create_calendar_feed_router(options: ICalendarFeedRoutesOptions): Router {
  const router = Router();
  const read = require_app_permission(PermissionKey.GAMES_READ, options.permission_service);
  const manage = require_app_permission(
    PermissionKey.CALENDAR_FEED_MANAGE,
    options.permission_service,
  );
  router.use('/my_schedule/feed', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/my_schedule/feed', read, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const feed = await options.feed_service.get_feed(tenant_id);
      res.json({ data: { feed: feed ? to_feed_view(feed) : null } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/my_schedule/feed', manage, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const issued = await options.feed_service.issue_feed(to_acting_user(req, tenant_id));
      res.status(201).json({
        data: {
          feed: to_feed_view(issued.feed),
          token: issued.token,
          path: `${FEED_PATH_PREFIX}${issued.token}.ics`,
        },
      });
    } catch (error) {
      if (error instanceof CalendarFeedExistsError) {
        send_api_error(
          res,
          409,
          ApiErrorCode.FEED_EXISTS,
          'A calendar feed already exists. Rotate it to get a new link',
        );
        return;
      }
      next(error);
    }
  });

  router.post('/my_schedule/feed/rotate', manage, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const issued = await options.feed_service.rotate_feed(to_acting_user(req, tenant_id));
      res.json({
        data: {
          feed: to_feed_view(issued.feed),
          token: issued.token,
          path: `${FEED_PATH_PREFIX}${issued.token}.ics`,
        },
      });
    } catch (error) {
      if (error instanceof CalendarFeedNotFoundError) {
        send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'There is no calendar feed to rotate');
        return;
      }
      next(error);
    }
  });

  router.delete('/my_schedule/feed', manage, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      await options.feed_service.revoke_feed(to_acting_user(req, tenant_id));
      res.json({ data: { feed: null } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
