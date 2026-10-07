import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { connection_id_param_schema } from '../sync/schemas/connection_id_param.schema.js';
import { ConnectionAdminService } from './connection_admin.service.js';
import { ConnectionAccountMismatchError } from './errors/connection_account_mismatch.error.js';
import { ConnectionCredentialsIncompleteError } from './errors/connection_credentials_incomplete.error.js';
import { ConnectionCredentialsRejectedError } from './errors/connection_credentials_rejected.error.js';
import { ConnectionNotFoundError } from './errors/connection_not_found.error.js';
import { IAdminActor } from './models/admin_actor.model.js';
import {
  connection_credentials_body_schema,
  replace_credentials_body_schema,
} from './schemas/connection_credentials_body.schema.js';
import { to_connection_view } from './views/to_connection_view.js';

/** Dependencies of the connection admin routes. */
export interface IConnectionsAdminRoutesOptions {
  admin_service: ConnectionAdminService;
  permission_service: RolePermissionService;
}

function to_actor(req: Request, tenant_id: string): IAdminActor {
  const auth = req.auth;
  return {
    tenant_id,
    user_id: auth?.real.uid ?? '',
    actual_role: auth?.real.role ?? '',
    effective_role: auth?.effective.role ?? '',
  };
}

/** Maps the service's known failures to API errors; anything else goes to the error handler. */
function handle_admin_error(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ConnectionNotFoundError) {
    send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Connection not found');
  } else if (error instanceof ConnectionCredentialsIncompleteError) {
    send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', [
      { path: 'client_id', message: 'Required because no client id is stored for this connection' },
    ]);
  } else if (error instanceof ConnectionCredentialsRejectedError) {
    send_api_error(
      res,
      422,
      ApiErrorCode.CREDENTIALS_REJECTED,
      'The provider did not accept these credentials',
    );
  } else if (error instanceof ConnectionAccountMismatchError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.ACCOUNT_MISMATCH,
      'These credentials belong to a different account. Add a new connection instead',
    );
  } else if (error instanceof AssignrApiError) {
    console.error('Provider unavailable while managing a connection', error);
    send_api_error(
      res,
      502,
      ApiErrorCode.PROVIDER_UNAVAILABLE,
      'The provider could not be reached. Try again shortly',
    );
  } else {
    next(error);
  }
}

/**
 * Builds the routes a tenant owner uses to manage connections and their client
 * credentials. Mount after the auth middleware. Credentials are accepted in
 * request bodies only; they are never returned, logged or put in an error.
 * @openapi
 * /api/connections:
 *   post:
 *     summary: Connect a provider account with the tenant's own client credentials
 *     description: The credentials are verified with the provider before anything is saved. Connecting an account the tenant already has reuses that connection.
 *     responses:
 *       201: { description: The connection. }
 *       400: { description: Invalid input, or no tenant to act in. }
 *       403: { description: Requires the connections.manage permission. }
 *       422: { description: The provider rejected the credentials. }
 *       502: { description: The provider could not be reached. }
 * /api/connections/{connection_id}/credentials:
 *   put:
 *     summary: Replace a connection's credentials (same provider account only)
 *     description: Omit client_id to rotate only the secret; the stored client id is kept.
 *     responses:
 *       200: { description: The connection, reconnected. }
 *       404: { description: No such connection for this tenant. }
 *       409: { description: The credentials belong to a different account. }
 *       422: { description: The provider rejected the credentials. }
 * /api/connections/{connection_id}/test:
 *   post:
 *     summary: Test the stored credentials without changing anything
 *     responses:
 *       200: { description: "{ ok, failure }" }
 * /api/connections/{connection_id}/disconnect:
 *   post:
 *     summary: Delete the stored credentials and mark the connection disconnected
 *     responses:
 *       200: { description: The connection. }
 * @param options Services the routes use.
 * @returns An Express router.
 */
export function create_connections_admin_router(options: IConnectionsAdminRoutesOptions): Router {
  const router = Router();
  const manage = require_app_permission(
    PermissionKey.CONNECTIONS_MANAGE,
    options.permission_service,
  );

  router.post('/connections', manage, async (req, res, next) => {
    try {
      const body = parse_with_schema(connection_credentials_body_schema, req.body ?? {});
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

      const connection = await options.admin_service.create_connection(
        to_actor(req, tenant_id),
        body.data,
      );
      res.status(201).json({ data: { connection: to_connection_view(connection) } });
    } catch (error) {
      handle_admin_error(error, res, next);
    }
  });

  router.put('/connections/:connection_id/credentials', manage, async (req, res, next) => {
    try {
      const params = parse_with_schema(connection_id_param_schema, req.params);
      const body = parse_with_schema(replace_credentials_body_schema, req.body ?? {});
      if (!params.ok || !body.ok) {
        send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', [
          ...(params.ok ? [] : params.violations),
          ...(body.ok ? [] : body.violations),
        ]);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;

      const connection = await options.admin_service.replace_credentials(
        to_actor(req, tenant_id),
        params.data.connection_id,
        body.data,
      );
      res.json({ data: { connection: to_connection_view(connection) } });
    } catch (error) {
      handle_admin_error(error, res, next);
    }
  });

  router.post('/connections/:connection_id/test', manage, async (req, res, next) => {
    try {
      const params = parse_with_schema(connection_id_param_schema, req.params);
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

      const result = await options.admin_service.test_connection(
        tenant_id,
        params.data.connection_id,
      );
      res.json({ data: result });
    } catch (error) {
      handle_admin_error(error, res, next);
    }
  });

  router.post('/connections/:connection_id/disconnect', manage, async (req, res, next) => {
    try {
      const params = parse_with_schema(connection_id_param_schema, req.params);
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

      const connection = await options.admin_service.disconnect(
        to_actor(req, tenant_id),
        params.data.connection_id,
      );
      res.json({ data: { connection: to_connection_view(connection) } });
    } catch (error) {
      handle_admin_error(error, res, next);
    }
  });

  return router;
}
