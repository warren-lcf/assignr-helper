import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ConnectionNotFoundError } from '../connections/errors/connection_not_found.error.js';
import { ConnectionNotSyncableError } from '../connections/errors/connection_not_syncable.error.js';
import { IConnectionStore } from '../connections/ports/connection_store.interface.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { ConnectionSyncService } from './connection_sync.service.js';
import { ISyncRunStore } from './ports/sync_run_store.interface.js';
import { connection_id_param_schema } from './schemas/connection_id_param.schema.js';
import { sync_connection_body_schema } from './schemas/sync_connection_body.schema.js';
import { sync_runs_query_schema } from './schemas/sync_runs_query.schema.js';
import { to_sync_run_view } from './views/to_sync_run_view.js';

/** Dependencies of the sync routes. */
export interface ISyncRoutesOptions {
  sync_service: ConnectionSyncService;
  connections: IConnectionStore;
  runs: ISyncRunStore;
  permission_service: RolePermissionService;
}

/**
 * Builds the sync routes. Mount after the auth middleware; every route is
 * scoped to the caller's effective tenant.
 * @openapi
 * /api/connections/{connection_id}/sync:
 *   post:
 *     summary: Sync one connection now
 *     description: Runs organizations (first time or on request), open games and my games, in order, and returns each run.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               refresh_reference_data: { type: boolean }
 *     responses:
 *       200: { description: The runs, each SUCCEEDED, FAILED or SKIPPED. }
 *       400: { description: Invalid input, or no tenant to act in. }
 *       403: { description: Requires the sync.run permission. }
 *       404: { description: No such connection for this tenant. }
 *       409: { description: The connection is not in a syncable state. }
 * /api/connections/{connection_id}/sync-runs:
 *   get:
 *     summary: Recent sync history for a connection, newest first
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: The runs. }
 *       404: { description: No such connection for this tenant. }
 * @param options Services and stores the routes use.
 * @returns An Express router.
 */
export function create_sync_router(options: ISyncRoutesOptions): Router {
  const router = Router();

  router.post(
    '/connections/:connection_id/sync',
    require_app_permission(PermissionKey.SYNC_RUN, options.permission_service),
    async (req, res, next) => {
      try {
        const params = parse_with_schema(connection_id_param_schema, req.params);
        const body = parse_with_schema(sync_connection_body_schema, req.body ?? {});
        if (!params.ok || !body.ok) {
          send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', [
            ...(params.ok ? [] : params.violations),
            ...(body.ok ? [] : body.violations),
          ]);
          return;
        }
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null || !req.auth) return;

        const runs = await options.sync_service.sync_one(
          tenant_id,
          params.data.connection_id,
          req.auth.real.uid,
          body.data.refresh_reference_data ?? false,
        );
        res.json({ data: { runs: runs.map(to_sync_run_view) } });
      } catch (error) {
        if (error instanceof ConnectionNotFoundError) {
          send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Connection not found');
        } else if (error instanceof ConnectionNotSyncableError) {
          send_api_error(
            res,
            409,
            ApiErrorCode.CONNECTION_NOT_SYNCABLE,
            `This connection cannot be synced while it is ${error.status}`,
          );
        } else {
          next(error);
        }
      }
    },
  );

  router.get(
    '/connections/:connection_id/sync-runs',
    require_app_permission(PermissionKey.GAMES_READ, options.permission_service),
    async (req, res, next) => {
      try {
        const params = parse_with_schema(connection_id_param_schema, req.params);
        const query = parse_with_schema(sync_runs_query_schema, req.query);
        if (!params.ok || !query.ok) {
          send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', [
            ...(params.ok ? [] : params.violations),
            ...(query.ok ? [] : query.violations),
          ]);
          return;
        }
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null) return;

        const connection = await options.connections.get_connection(
          tenant_id,
          params.data.connection_id,
        );
        if (!connection) {
          send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Connection not found');
          return;
        }
        const runs = await options.runs.list_runs(
          tenant_id,
          params.data.connection_id,
          query.data.limit,
        );
        res.json({ data: { runs: runs.map(to_sync_run_view) } });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
