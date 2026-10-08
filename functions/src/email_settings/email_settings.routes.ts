import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { to_acting_user } from '../http/to_acting_user.js';
import { EmailSettingsService } from './email_settings.service.js';
import { EmailApiKeyRequiredError } from './errors/email_api_key_required.error.js';
import { email_settings_body_schema } from './schemas/email_settings_body.schema.js';

/** Dependencies of the email settings routes. */
export interface IEmailSettingsRoutesOptions {
  settings_service: EmailSettingsService;
  permission_service: RolePermissionService;
}

/**
 * Builds the routes a tenant owner uses to connect their own SendGrid account. Mount after the
 * auth middleware. The API key is accepted in a request body only; it is never returned, logged
 * or put in an error, and every response is uncacheable.
 * @openapi
 * /api/email/settings:
 *   get:
 *     summary: The tenant's email settings, without the API key
 *     responses:
 *       200: { description: "data.settings: configured, from_email, from_name, reply_to, postal_address." }
 *       403: { description: Requires the email.send permission. }
 *   put:
 *     summary: Save the tenant's email settings
 *     description: >
 *       api_key is required until email is configured and optional afterwards (omitted keeps the
 *       stored key). The other fields are replaced as a whole.
 *     responses:
 *       200: { description: "data.settings, without the API key." }
 *       400: { description: Invalid input, or no tenant to act in. }
 *   delete:
 *     summary: Remove the tenant's email settings and API key
 *     responses:
 *       200: { description: "data.settings, now unconfigured." }
 * @param options Service and permission resolver.
 * @returns An Express router.
 */
export function create_email_settings_router(options: IEmailSettingsRoutesOptions): Router {
  const router = Router();
  const send = require_app_permission(PermissionKey.EMAIL_SEND, options.permission_service);
  router.use('/email/settings', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/email/settings', send, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      res.json({ data: { settings: await options.settings_service.get_view(tenant_id) } });
    } catch (error) {
      next(error);
    }
  });

  router.put('/email/settings', send, async (req, res, next) => {
    try {
      const body = parse_with_schema(email_settings_body_schema, req.body ?? {});
      if (!body.ok) {
        send_api_error(
          res,
          400,
          ApiErrorCode.VALIDATION_ERROR,
          'The request is not valid',
          body.violations,
        );
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const settings = await options.settings_service.save(to_acting_user(req, tenant_id), {
        api_key: body.data.api_key ?? null,
        from_email: body.data.from_email,
        from_name: body.data.from_name ?? null,
        reply_to: body.data.reply_to ?? null,
        postal_address: body.data.postal_address ?? null,
      });
      res.json({ data: { settings } });
    } catch (error) {
      if (error instanceof EmailApiKeyRequiredError) {
        send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', [
          { path: 'api_key', message: 'Required until email sending is configured' },
        ]);
        return;
      }
      next(error);
    }
  });

  router.delete('/email/settings', send, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const settings = await options.settings_service.remove(to_acting_user(req, tenant_id));
      res.json({ data: { settings } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
