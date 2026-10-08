import { Router } from 'express';
import type { Request, Response } from 'express';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { IRateLimitDecision } from '../http/rate_limit/rate_limit_decision.model.js';
import { apply_public_headers } from '../quick_links/apply_public_headers.js';
import { unsubscribe_token_param_schema } from './schemas/unsubscribe_token_param.schema.js';
import { UnsubscribeKeyUnavailableError } from './errors/unsubscribe_key_unavailable.error.js';
import { UnsubscribeService } from './unsubscribe.service.js';

/** The one answer for every token that cannot be used, whatever the reason. */
const LINK_NOT_AVAILABLE_MESSAGE = 'This link is not available';

/** Dependencies of the public unsubscribe routes. */
export interface IPublicUnsubscribeRoutesOptions {
  service: UnsubscribeService;
  /** Spent on every request, so one client cannot hammer the endpoint. */
  request_limiter: IRateLimiter;
  /**
   * Spent only when a token does not open anything, and checked before every lookup, so guessing
   * tokens is throttled harder than reading.
   */
  failure_limiter: IRateLimiter;
}

/**
 * Sends the 404 shared by malformed, forged and unknown tokens. The body is identical in every
 * case, so a response never tells which of them it was.
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
 * Builds the public (no sign-in) unsubscribe routes. Mount them BEFORE the auth middleware. The
 * caller's authority is the signed token in the URL: its shape is checked before any lookup, its
 * signature in constant time, and every unusable token gets the same 404. `GET` only looks (mail
 * scanners prefetch links) and `POST` unsubscribes. Clients are rate limited by `req.ip`, so the
 * app must be configured with the right `trust proxy` for where it is deployed.
 * @openapi
 * /api/public/unsubscribe/{token}:
 *   get:
 *     summary: Look at an unsubscribe link (no sign-in, no side effects)
 *     description: >
 *       Answers with a masked address and whether the contact has already unsubscribed. Malformed,
 *       forged and unknown tokens all answer 404 with the same body. Never cached.
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string, minLength: 48, maxLength: 256 } }
 *     responses:
 *       200: { description: "data.email_masked and data.already_unsubscribed." }
 *       404: { description: This link is not available. }
 *       429: { description: Too many requests; see Retry-After. }
 *   post:
 *     summary: Unsubscribe (no sign-in)
 *     description: Idempotent. The contact is never emailed again and can not be subscribed again through any API.
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string, minLength: 48, maxLength: 256 } }
 *     responses:
 *       200: { description: "data.unsubscribed is true." }
 *       404: { description: This link is not available. }
 *       429: { description: Too many requests; see Retry-After. }
 * @param options Service and rate limiters.
 * @returns An Express router exposing `/public/unsubscribe/:token`.
 */
export function create_public_unsubscribe_router(options: IPublicUnsubscribeRoutesOptions): Router {
  const router = Router();
  router.use('/public/unsubscribe', apply_public_headers);

  /**
   * Runs one token-bearing request through rate limiting and token checks.
   * @param req Express request.
   * @param res Express response.
   * @param act Does the work for a well-formed token; returns the response data or null when the token is not usable.
   * @returns Nothing; the response is finished.
   */
  async function handle(
    req: Request,
    res: Response,
    act: (token: string) => Promise<object | null>,
  ): Promise<void> {
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
    const params = parse_with_schema(unsubscribe_token_param_schema, req.params);
    const data = params.ok ? await act(params.data.token) : null;
    if (data === null) {
      options.failure_limiter.try_consume(client_key);
      send_link_not_available(res);
      return;
    }
    res.json({ data });
  }

  /**
   * Turns a failure to reach the signing key into a clear 503 rather than a bare 500.
   * @param error What was thrown.
   * @param res Express response.
   * @param next Passes unknown errors on.
   * @returns Nothing.
   */
  function handle_failure(error: unknown, res: Response, next: (error: unknown) => void): void {
    if (error instanceof UnsubscribeKeyUnavailableError) {
      res.status(503).json({
        code: ApiErrorCode.UNSUBSCRIBE_KEY_UNAVAILABLE,
        message: 'Unsubscribing is temporarily unavailable. Try again shortly',
      });
      return;
    }
    next(error);
  }

  router.get('/public/unsubscribe/:token', async (req, res, next) => {
    try {
      await handle(req, res, (token) => options.service.describe(token));
    } catch (error) {
      handle_failure(error, res, next);
    }
  });

  router.post('/public/unsubscribe/:token', async (req, res, next) => {
    try {
      await handle(req, res, async (token) =>
        (await options.service.unsubscribe(token)) ? { unsubscribed: true } : null,
      );
    } catch (error) {
      handle_failure(error, res, next);
    }
  });

  return router;
}
