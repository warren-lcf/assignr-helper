import { Router } from 'express';
import type { Response } from 'express';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { IRateLimitDecision } from '../http/rate_limit/rate_limit_decision.model.js';
import { send_api_error } from '../http/send_api_error.js';
import { apply_public_headers } from './apply_public_headers.js';
import { PublicQuickLinkService } from './public_quick_link.service.js';
import { public_games_query_schema } from './schemas/public_games_query.schema.js';
import { public_quick_link_token_param_schema } from './schemas/public_quick_link_token_param.schema.js';

/** The one answer for every token that cannot be used, whatever the reason. */
const LINK_NOT_AVAILABLE_MESSAGE = 'This link is not available';

/** Dependencies of the public quick-link routes. */
export interface IPublicQuickLinksRoutesOptions {
  service: PublicQuickLinkService;
  /** Spent on every request, so one client cannot hammer the endpoint. */
  request_limiter: IRateLimiter;
  /**
   * Spent only when a token does not open a link, and checked before every lookup, so guessing
   * tokens is throttled harder than reading.
   */
  failure_limiter: IRateLimiter;
}

/**
 * Sends the 404 shared by unknown, malformed, revoked and expired tokens. The body is identical
 * in every case, so a response never tells which of them it was.
 * @param res Express response.
 * @returns Nothing; the response is finished.
 */
function send_link_not_available(res: Response): void {
  res.status(404).json({ code: ApiErrorCode.NOT_FOUND, message: LINK_NOT_AVAILABLE_MESSAGE });
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
 * Builds the public (no sign-in) quick-link route. Mount it BEFORE the auth middleware. The
 * caller's identity is the bearer token in the URL: it is validated for shape before any lookup,
 * looked up by its hash, and every unusable token gets the same 404. Clients are rate limited by
 * `req.ip`, so the app must be configured with the right `trust proxy` for where it is deployed.
 * @openapi
 * /api/public/q/{token}/games:
 *   get:
 *     summary: The open games a quick link shows (no sign-in)
 *     description: >
 *       The token is the credential. Unknown, malformed, revoked and expired tokens all answer
 *       404 with the same body. Responses are never cached and carry no organization names,
 *       assignees, fees or provider ids. At most 1000 games are returned; total counts every match.
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string, minLength: 43, maxLength: 43 } }
 *       - { in: query, name: search, description: Case-insensitive text over teams, league, level, venue and location, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: level, schema: { type: string } }
 *       - { in: query, name: league, schema: { type: string } }
 *       - { in: query, name: location_group, description: Exact location label ignoring case, schema: { type: string } }
 *     responses:
 *       200: { description: "data.as_of, data.total, data.locations, data.levels, data.leagues, data.location_groups." }
 *       400: { description: Invalid query. }
 *       404: { description: This link is not available. }
 *       429: { description: Too many requests; see Retry-After. }
 * @param options Service and rate limiters.
 * @returns An Express router exposing `GET /public/q/:token/games`.
 */
export function create_public_quick_links_router(options: IPublicQuickLinksRoutesOptions): Router {
  const router = Router();
  router.use('/public', apply_public_headers);

  router.get('/public/q/:token/games', async (req, res, next) => {
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

      const params = parse_with_schema(public_quick_link_token_param_schema, req.params);
      const link = params.ok ? await options.service.open_link(params.data.token) : null;
      if (!link) {
        options.failure_limiter.try_consume(client_key);
        send_link_not_available(res);
        return;
      }

      const filters = parse_with_schema(public_games_query_schema, req.query);
      if (!filters.ok) {
        send_api_error(
          res,
          400,
          ApiErrorCode.VALIDATION_ERROR,
          'The request is not valid',
          filters.violations,
        );
        return;
      }
      res.json({ data: await options.service.get_games(link, filters.data) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
