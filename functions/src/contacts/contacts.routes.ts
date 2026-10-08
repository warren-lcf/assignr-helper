import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import type { NextFunction, Response } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { to_acting_user } from '../http/to_acting_user.js';
import { ContactService } from './contact.service.js';
import { ContactExistsError } from './errors/contact_exists.error.js';
import { ContactLimitReachedError } from './errors/contact_limit_reached.error.js';
import { ContactNotFoundError } from './errors/contact_not_found.error.js';
import { contact_id_param_schema } from './schemas/contact_id_param.schema.js';
import { create_contact_body_schema } from './schemas/create_contact_body.schema.js';
import { import_contacts_body_schema } from './schemas/import_contacts_body.schema.js';
import { to_contact_view } from './views/to_contact_view.js';

/** Dependencies of the contact routes. */
export interface IContactsRoutesOptions {
  contact_service: ContactService;
  permission_service: RolePermissionService;
}

/**
 * Maps the service's known failures to API errors; anything else goes to the error handler.
 * @param error What the service threw.
 * @param res Express response.
 * @param next Passes unknown errors on.
 * @returns Nothing; the response is finished or the error is passed on.
 */
function handle_contact_error(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ContactExistsError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.CONTACT_EXISTS,
      'A contact with this email address already exists',
    );
  } else if (error instanceof ContactLimitReachedError) {
    send_api_error(res, 409, ApiErrorCode.CONTACT_LIMIT_REACHED, error.message);
  } else if (error instanceof ContactNotFoundError) {
    send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Contact not found');
  } else {
    next(error);
  }
}

/**
 * Builds the routes a tenant owner uses to manage the people they email. Mount after the auth
 * middleware. Every route needs the email.send permission and acts in the caller's effective
 * tenant only.
 * @openapi
 * /api/contacts:
 *   get:
 *     summary: The tenant's contacts in display name order (at most 1000)
 *     responses:
 *       200: { description: "data.contacts, including contacts who unsubscribed." }
 *       400: { description: No tenant to act in. }
 *       403: { description: Requires the email.send permission. }
 *   post:
 *     summary: Add a contact
 *     description: >
 *       consent_attested must be literally true: the owner attests the person agreed to receive
 *       these emails. An address already held (ignoring case), or that opted out earlier, answers
 *       409 and never changes the existing contact.
 *     responses:
 *       201: { description: "data.contact." }
 *       400: { description: Invalid input, or no tenant to act in. }
 *       409: { description: "CONTACT_EXISTS, or CONTACT_LIMIT_REACHED at 1000 contacts." }
 * /api/contacts/import:
 *   post:
 *     summary: Add up to 200 contacts at once
 *     description: >
 *       Rows that are not acceptable are listed in data.invalid (1-based row, reason) and the rest
 *       are still added. Known addresses count as skipped_existing.
 *     responses:
 *       200: { description: "data.added, data.skipped_existing and data.invalid." }
 *       400: { description: Invalid request, or no tenant to act in. }
 * /api/contacts/{contact_id}:
 *   delete:
 *     summary: Delete a contact
 *     description: A contact who unsubscribed stays blocked (only a hash of the address is kept).
 *     responses:
 *       200: { description: "data.deleted is true." }
 *       404: { description: No such contact for this tenant. }
 * @param options Service and permission resolver.
 * @returns An Express router.
 */
export function create_contacts_router(options: IContactsRoutesOptions): Router {
  const router = Router();
  const send = require_app_permission(PermissionKey.EMAIL_SEND, options.permission_service);

  router.get('/contacts', send, async (req, res, next) => {
    try {
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const contacts = await options.contact_service.list_contacts(tenant_id);
      res.json({ data: { contacts: contacts.map(to_contact_view) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/contacts', send, async (req, res, next) => {
    try {
      const body = parse_with_schema(create_contact_body_schema, req.body ?? {});
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
      const contact = await options.contact_service.create_contact(to_acting_user(req, tenant_id), {
        display_name: body.data.display_name,
        email_address: body.data.email_address,
      });
      res.status(201).json({ data: { contact: to_contact_view(contact) } });
    } catch (error) {
      handle_contact_error(error, res, next);
    }
  });

  router.post('/contacts/import', send, async (req, res, next) => {
    try {
      const body = parse_with_schema(import_contacts_body_schema, req.body ?? {});
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
      const result = await options.contact_service.import_contacts(
        to_acting_user(req, tenant_id),
        body.data.entries,
      );
      res.json({ data: result });
    } catch (error) {
      handle_contact_error(error, res, next);
    }
  });

  router.delete('/contacts/:contact_id', send, async (req, res, next) => {
    try {
      const params = parse_with_schema(contact_id_param_schema, req.params);
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
      await options.contact_service.delete_contact(
        to_acting_user(req, tenant_id),
        params.data.contact_id,
      );
      res.json({ data: { deleted: true } });
    } catch (error) {
      handle_contact_error(error, res, next);
    }
  });

  return router;
}
