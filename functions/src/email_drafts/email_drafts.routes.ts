import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { EmailDeliveryError } from '../email_delivery/errors/email_delivery.error.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { to_acting_user } from '../http/to_acting_user.js';
import { UnsubscribeKeyUnavailableError } from '../unsubscribe/errors/unsubscribe_key_unavailable.error.js';
import { EmailDraftService } from './email_draft.service.js';
import { EmailPreviewService } from './email_preview.service.js';
import { EmailSendService } from './email_send.service.js';
import { DraftConflictError } from './errors/draft_conflict.error.js';
import { DraftLockedError } from './errors/draft_locked.error.js';
import { DraftValidationError } from './errors/draft_validation.error.js';
import { EmailDraftNotFoundError } from './errors/email_draft_not_found.error.js';
import { EmailNotConfiguredError } from './errors/email_not_configured.error.js';
import { NoEmailOnAccountError } from './errors/no_email_on_account.error.js';
import { NoGamesError } from './errors/no_games.error.js';
import { NoRecipientsError } from './errors/no_recipients.error.js';
import { RecipientCountChangedError } from './errors/recipient_count_changed.error.js';
import { TooManyRecipientsError } from './errors/too_many_recipients.error.js';
import { draft_id_param_schema } from './schemas/draft_id_param.schema.js';
import { email_draft_body_schema } from './schemas/email_draft_body.schema.js';
import { send_draft_body_schema } from './schemas/send_draft_body.schema.js';
import { to_email_draft_view } from './views/to_email_draft_view.js';

/** Dependencies of the email draft routes. */
export interface IEmailDraftsRoutesOptions {
  draft_service: EmailDraftService;
  preview_service: EmailPreviewService;
  send_service: EmailSendService;
  permission_service: RolePermissionService;
  /** Spent on every test send, keyed by tenant and user, so the owner can not be used to spam their own inbox. */
  test_send_limiter: IRateLimiter;
}

/**
 * Sends the 400 for a request that failed validation.
 * @param res Express response.
 * @param violations The field-level problems.
 * @returns Nothing; the response is finished.
 */
function send_invalid(res: Response, violations: { path: string; message: string }[]): void {
  send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', violations);
}

/**
 * Maps the services' known failures to API errors; anything else goes to the error handler.
 * @param error What the service threw.
 * @param res Express response.
 * @param next Passes unknown errors on.
 * @returns Nothing; the response is finished or the error is passed on.
 */
function handle_draft_error(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof EmailDraftNotFoundError) {
    send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Email draft not found');
  } else if (error instanceof DraftLockedError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.DRAFT_LOCKED,
      'This draft is locked because it is being sent or has already been sent',
    );
  } else if (error instanceof DraftConflictError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.DRAFT_CONFLICT,
      'The draft was changed by someone else. Reload it and try again',
    );
  } else if (error instanceof DraftValidationError) {
    send_invalid(res, error.violations);
  } else if (error instanceof EmailNotConfiguredError) {
    send_api_error(
      res,
      422,
      ApiErrorCode.EMAIL_NOT_CONFIGURED,
      'Email sending is not set up yet. Add your SendGrid settings first',
    );
  } else if (error instanceof NoRecipientsError) {
    send_api_error(res, 400, ApiErrorCode.NO_RECIPIENTS, 'There is nobody to send this email to');
  } else if (error instanceof TooManyRecipientsError) {
    send_api_error(
      res,
      400,
      ApiErrorCode.TOO_MANY_RECIPIENTS,
      `A single send is limited to ${error.limit} recipients, and ${error.eligible} are eligible. Choose specific contacts instead`,
    );
  } else if (error instanceof RecipientCountChangedError) {
    res.status(409).json({
      code: ApiErrorCode.RECIPIENT_COUNT_CHANGED,
      message: `The number of recipients changed: ${error.current} contacts can now be emailed. Review and confirm again`,
      violations: [{ path: 'current', message: String(error.current) }],
      current: error.current,
    });
  } else if (error instanceof NoGamesError) {
    send_api_error(
      res,
      400,
      ApiErrorCode.NO_GAMES,
      'No open games match this draft, so there is nothing to send',
    );
  } else if (error instanceof NoEmailOnAccountError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.NO_EMAIL_ON_ACCOUNT,
      'Your account has no verified email address to send a test to',
    );
  } else if (error instanceof EmailDeliveryError) {
    send_api_error(
      res,
      502,
      ApiErrorCode.EMAIL_DELIVERY_FAILED,
      'The email provider did not accept the message. Check your email settings',
      [{ path: 'error_code', message: error.error_code }],
    );
  } else if (error instanceof UnsubscribeKeyUnavailableError) {
    send_api_error(
      res,
      503,
      ApiErrorCode.UNSUBSCRIBE_KEY_UNAVAILABLE,
      'Unsubscribe links are temporarily unavailable, so nothing was sent. Try again shortly',
    );
  } else {
    next(error);
  }
}

/**
 * Builds the routes a tenant owner uses to write, preview, test and send "games available"
 * emails. Mount after the auth middleware. Every route needs the email.send permission and acts
 * in the caller's effective tenant only. The rules that keep sending safe (consent, the
 * confirmed recipient count, no empty email, one send at a time) are enforced by the services,
 * not by the client.
 * @openapi
 * /api/email_drafts:
 *   post:
 *     summary: Create an email draft
 *     responses:
 *       201: { description: "data.draft." }
 *       400: { description: Invalid input, or no tenant to act in. }
 *   get:
 *     summary: The tenant's drafts, newest first (at most 200)
 *     responses:
 *       200: { description: "data.drafts." }
 * /api/email_drafts/{draft_id}:
 *   get:
 *     summary: One draft
 *     responses:
 *       200: { description: "data.draft." }
 *       404: { description: No such draft for this tenant. }
 *   put:
 *     summary: Replace a draft's content (only while its status is DRAFT)
 *     responses:
 *       200: { description: "data.draft." }
 *       409: { description: "DRAFT_LOCKED when a send has started or finished." }
 *   delete:
 *     summary: Delete a draft (only while its status is DRAFT)
 *     responses:
 *       200: { description: "data.deleted is true." }
 *       409: { description: DRAFT_LOCKED. }
 * /api/email_drafts/{draft_id}/preview:
 *   get:
 *     summary: Render the email from live games, count the recipients and list warnings
 *     responses:
 *       200: { description: "data: subject, html, text, game_count, eligible_recipient_count, skipped and warnings." }
 * /api/email_drafts/{draft_id}/test_send:
 *   post:
 *     summary: Send a test copy to the signed-in person's own verified address only
 *     responses:
 *       200: { description: "data.sent is true." }
 *       409: { description: NO_EMAIL_ON_ACCOUNT. }
 *       422: { description: EMAIL_NOT_CONFIGURED. }
 *       429: { description: Too many test sends. }
 *       502: { description: EMAIL_DELIVERY_FAILED. }
 * /api/email_drafts/{draft_id}/send:
 *   post:
 *     summary: Send the draft to its recipients
 *     description: >
 *       confirm_recipient_count must equal the recomputed number of eligible recipients. At most
 *       100 recipients per send. Never sends an empty digest. Only one send of a draft can run at a time.
 *     responses:
 *       200: { description: "data: status (SENT or PARTIALLY_SENT), sent, failed and a result per recipient." }
 *       400: { description: "NO_RECIPIENTS, TOO_MANY_RECIPIENTS or NO_GAMES." }
 *       409: { description: "DRAFT_LOCKED or RECIPIENT_COUNT_CHANGED (with current)." }
 *       422: { description: EMAIL_NOT_CONFIGURED. }
 * @param options Services and permission resolver.
 * @returns An Express router.
 */
export function create_email_drafts_router(options: IEmailDraftsRoutesOptions): Router {
  const router = Router();
  const send = require_app_permission(PermissionKey.EMAIL_SEND, options.permission_service);

  /**
   * Reads and checks the draft id in the path.
   * @param req Express request.
   * @param res Express response, used to send the 400.
   * @returns The draft id, or null after the 400 has been sent.
   */
  function read_draft_id(req: Request, res: Response): string | null {
    const params = parse_with_schema(draft_id_param_schema, req.params);
    if (!params.ok) {
      send_invalid(res, params.violations);
      return null;
    }
    return params.data.draft_id;
  }

  router.post('/email_drafts', send, async (req, res, next) => {
    try {
      const body = parse_with_schema(email_draft_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const draft = await options.draft_service.create_draft(
        to_acting_user(req, tenant_id),
        body.data,
      );
      res.status(201).json({ data: { draft: to_email_draft_view(draft) } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.get('/email_drafts', send, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const drafts = await options.draft_service.list_drafts(tenant_id);
      res.json({ data: { drafts: drafts.map(to_email_draft_view) } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.get('/email_drafts/:draft_id', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const draft = await options.draft_service.get_draft(tenant_id, draft_id);
      res.json({ data: { draft: to_email_draft_view(draft) } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.put('/email_drafts/:draft_id', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const body = parse_with_schema(email_draft_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const draft = await options.draft_service.update_draft(
        to_acting_user(req, tenant_id),
        draft_id,
        body.data,
      );
      res.json({ data: { draft: to_email_draft_view(draft) } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.delete('/email_drafts/:draft_id', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      await options.draft_service.delete_draft(to_acting_user(req, tenant_id), draft_id);
      res.json({ data: { deleted: true } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.get('/email_drafts/:draft_id/preview', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await options.preview_service.preview(tenant_id, draft_id) });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.post('/email_drafts/:draft_id/test_send', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const real = req.auth?.real;
      const allowance = options.test_send_limiter.try_consume(
        JSON.stringify([tenant_id, real?.uid ?? '']),
      );
      if (!allowance.allowed) {
        res.setHeader('Retry-After', String(allowance.retry_after_seconds));
        send_api_error(
          res,
          429,
          ApiErrorCode.RATE_LIMITED,
          'Too many test emails. Try again shortly',
        );
        return;
      }
      // The address comes from the verified token of the real person, never from the request.
      await options.preview_service.test_send(to_acting_user(req, tenant_id), draft_id, {
        email: real?.email ?? null,
        email_verified: real?.email_verified === true,
      });
      res.json({ data: { sent: true } });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  router.post('/email_drafts/:draft_id/send', send, async (req, res, next) => {
    try {
      const draft_id = read_draft_id(req, res);
      if (draft_id === null) return;
      const body = parse_with_schema(send_draft_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const result = await options.send_service.send(
        to_acting_user(req, tenant_id),
        draft_id,
        body.data.confirm_recipient_count,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: result });
    } catch (error) {
      handle_draft_error(error, res, next);
    }
  });

  return router;
}
