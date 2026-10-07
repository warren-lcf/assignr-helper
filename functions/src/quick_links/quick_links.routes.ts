import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import type { Request } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { QuickLinkNotFoundError } from './errors/quick_link_not_found.error.js';
import { IQuickLinkActor } from './models/quick_link_actor.model.js';
import { QuickLinkService } from './quick_link.service.js';
import { quick_link_id_param_schema } from './schemas/quick_link_id_param.schema.js';

/** Dependencies of the quick-link owner routes. */
export interface IQuickLinksRoutesOptions {
  quick_link_service: QuickLinkService;
  permission_service: RolePermissionService;
}

/**
 * Builds the acting identity for stamps and the audit trail.
 * @param req Express request, after the auth middleware.
 * @param tenant_id Tenant being acted in.
 * @returns The actor: the real person, with the actual and effective roles.
 */
function to_actor(req: Request, tenant_id: string): IQuickLinkActor {
  const auth = req.auth;
  return {
    tenant_id,
    user_id: auth?.real.uid ?? '',
    actual_role: auth?.real.role ?? '',
    effective_role: auth?.effective.role ?? '',
  };
}

/**
 * Builds the routes a tenant owner uses to manage quick links. Mount after the auth middleware.
 * The token appears in exactly one response, the one that creates the link.
 * @openapi
 * /api/quick_links:
 *   post:
 *     summary: Create a quick link
 *     description: >
 *       Returns the link and its token once; only a hash of the token is stored, so the token can
 *       never be shown again. The response is not cacheable.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               scope:
 *                 type: object
 *                 additionalProperties: false
 *                 properties:
 *                   organization_ids: { type: array, maxItems: 50, items: { type: string } }
 *                   levels: { type: array, maxItems: 20, items: { type: string } }
 *                   date_start: { type: integer, nullable: true, description: UTC-midnight milliseconds }
 *                   date_end: { type: integer, nullable: true, description: UTC-midnight milliseconds, not before date_start }
 *               expires_at: { type: integer, nullable: true, description: UTC milliseconds in the future and at most 400 days ahead; omit or null to never expire }
 *     responses:
 *       201: { description: "data.quick_link, data.token and data.path (/q/<token>)." }
 *       400: { description: Invalid input, or no tenant to act in. }
 *       403: { description: Requires the quick_links.manage permission. }
 *   get:
 *     summary: The tenant's quick links, newest first
 *     description: Never includes the token or its hash.
 *     responses:
 *       200: { description: "data.quick_links." }
 *       400: { description: No tenant to act in. }
 *       403: { description: Requires the quick_links.manage permission. }
 * /api/quick_links/{link_id}/revoke:
 *   post:
 *     summary: Revoke a quick link
 *     description: Idempotent. The link stops working at once.
 *     responses:
 *       200: { description: "data.quick_link." }
 *       404: { description: No such link for this tenant. }
 * @param options Service and permission resolver.
 * @returns An Express router.
 */
export function create_quick_links_router(options: IQuickLinksRoutesOptions): Router {
  const router = Router();
  const manage = require_app_permission(
    PermissionKey.QUICK_LINKS_MANAGE,
    options.permission_service,
  );

  router.post('/quick_links', manage, async (req, res, next) => {
    try {
      const body = parse_with_schema(options.quick_link_service.create_body_schema, req.body ?? {});
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

      const created = await options.quick_link_service.create_link(
        to_actor(req, tenant_id),
        body.data,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({
        data: {
          quick_link: options.quick_link_service.view_of(created.link),
          token: created.token,
          path: `/q/${created.token}`,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/quick_links', manage, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const links = await options.quick_link_service.list_links(tenant_id);
      res.json({
        data: { quick_links: links.map((link) => options.quick_link_service.view_of(link)) },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/quick_links/:link_id/revoke', manage, async (req, res, next) => {
    try {
      const params = parse_with_schema(quick_link_id_param_schema, req.params);
      if (!params.ok) {
        send_api_error(
          res,
          400,
          ApiErrorCode.VALIDATION_ERROR,
          'The request is not valid',
          params.violations,
        );
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;

      const link = await options.quick_link_service.revoke_link(
        to_actor(req, tenant_id),
        params.data.link_id,
      );
      res.json({ data: { quick_link: options.quick_link_service.view_of(link) } });
    } catch (error) {
      if (error instanceof QuickLinkNotFoundError) {
        send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Quick link not found');
        return;
      }
      next(error);
    }
  });

  return router;
}
