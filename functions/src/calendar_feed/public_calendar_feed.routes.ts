import { Router } from 'express';
import type { Response } from 'express';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { IRateLimitDecision } from '../http/rate_limit/rate_limit_decision.model.js';
import { apply_public_headers } from '../quick_links/apply_public_headers.js';
import { CALENDAR_FEED_LIMITS } from './calendar_feed_limits.constant.js';
import { PublicCalendarFeedService } from './public_calendar_feed.service.js';
import { public_feed_token_file_param_schema } from './schemas/public_feed_token_file_param.schema.js';

/** The one answer for every token that cannot be used, whatever the reason. */
const FEED_NOT_AVAILABLE_MESSAGE = 'This link is not available';

/** Length of the token before the `.ics` suffix. */
const TOKEN_LENGTH = 43;

/** Dependencies of the public calendar feed route. */
export interface IPublicCalendarFeedRoutesOptions {
  service: PublicCalendarFeedService;
  /**
   * Spent on every request. Calendar apps fetch from shared addresses (a provider's servers serve
   * many people), so this allowance is generous.
   */
  request_limiter: IRateLimiter;
  /**
   * Spent only when a token does not open a feed, and checked before every lookup, so guessing
   * tokens is throttled far harder than reading.
   */
  failure_limiter: IRateLimiter;
}

/**
 * Sends the 404 shared by unknown, malformed, revoked and rotated-out tokens. The body is
 * identical in every case, so a response never tells which of them it was.
 * @param res Express response.
 * @returns Nothing; the response is finished.
 */
function send_feed_not_available(res: Response): void {
  res.status(404).json({ code: ApiErrorCode.NOT_FOUND, message: FEED_NOT_AVAILABLE_MESSAGE });
}

/**
 * Sends a 429 with the time to wait.
 * @param res Express response.
 * @param decision The limiter's refusal.
 * @returns Nothing; the response is finished.
 */
function send_rate_limited(res: Response, decision: IRateLimitDecision): void {
  res.setHeader('Retry-After', String(decision.retry_after_seconds));
  res.status(429).json({
    code: ApiErrorCode.RATE_LIMITED,
    message: 'Too many requests. Try again shortly',
  });
}

/**
 * Builds the public (no sign-in) calendar feed route. Mount it BEFORE the auth middleware. The
 * caller's identity is the bearer token in the URL: it is validated for shape before any lookup,
 * looked up by its hash, and every unusable token gets the same 404. Clients are rate limited by
 * `req.ip`, so the app must be configured with the right `trust proxy` for where it is deployed.
 * @openapi
 * /api/public/cal/{token_file}:
 *   get:
 *     summary: The tenant's referee schedule as an iCalendar feed (no sign-in)
 *     description: >
 *       The token is the credential. Unknown, malformed, revoked and rotated-out tokens all answer
 *       404 with the same body. Responses are never cached and carry no other officials' names,
 *       fees or provider ids. At most 1000 events are returned.
 *     parameters:
 *       - { in: path, name: token_file, required: true, description: "The 43 character token followed by .ics", schema: { type: string, pattern: '^[A-Za-z0-9_-]{43}\.ics$' } }
 *     responses:
 *       200: { description: "text/calendar (RFC 5545)." }
 *       404: { description: This link is not available. }
 *       429: { description: Too many requests; see Retry-After. }
 * @param options Service and rate limiters.
 * @returns An Express router exposing `GET /public/cal/:token_file`.
 */
export function create_public_calendar_feed_router(
  options: IPublicCalendarFeedRoutesOptions,
): Router {
  const router = Router();
  router.use('/public', apply_public_headers);

  router.get('/public/cal/:token_file', async (req, res, next) => {
    try {
      const client_key = req.ip ?? 'unknown';

      const allowance = options.request_limiter.try_consume(client_key);
      if (!allowance.allowed) {
        send_rate_limited(res, allowance);
        return;
      }
      const guessing = options.failure_limiter.peek(client_key);
      if (!guessing.allowed) {
        send_rate_limited(res, guessing);
        return;
      }

      const params = parse_with_schema(public_feed_token_file_param_schema, req.params);
      const tenant_id = params.ok
        ? await options.service.open_feed(params.data.token_file.slice(0, TOKEN_LENGTH))
        : null;
      if (tenant_id === null) {
        options.failure_limiter.try_consume(client_key);
        send_feed_not_available(res);
        return;
      }

      const body = await options.service.render_ics(tenant_id);
      res.status(200);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${CALENDAR_FEED_LIMITS.FILE_NAME}"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
