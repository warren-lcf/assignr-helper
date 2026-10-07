import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { require_tenant } from '../http/require_tenant.js';
import { IConnectionStore } from './ports/connection_store.interface.js';
import { to_connection_view } from './views/to_connection_view.js';

/**
 * Builds the read-only connections route. Mount after the auth middleware.
 * @openapi
 * /api/connections:
 *   get:
 *     summary: The tenant's provider connections
 *     description: Never includes where credentials are stored.
 *     responses:
 *       200: { description: The connections. }
 *       400: { description: No tenant to act in. }
 *       403: { description: Requires the games.read permission. }
 * @param connections Connection store.
 * @param permission_service Resolves a role's permission keys.
 * @returns An Express router exposing `GET /connections`.
 */
export function create_connections_router(
  connections: IConnectionStore,
  permission_service: RolePermissionService,
): Router {
  const router = Router();
  router.get(
    '/connections',
    require_app_permission(PermissionKey.GAMES_READ, permission_service),
    async (req, res, next) => {
      try {
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null) return;
        const rows = await connections.list_connections(tenant_id);
        res.json({ data: { connections: rows.map(to_connection_view) } });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
