import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { GamesListService } from './games_list.service.js';

/** Dependencies of the games routes. */
export interface IGamesRoutesOptions {
  games_service: GamesListService;
  permission_service: RolePermissionService;
}

/**
 * Builds the read-only games route. Mount after the auth middleware; it serves the caller's
 * effective tenant only, from our stored copy, across all of the tenant's connections.
 * @openapi
 * /api/games:
 *   get:
 *     summary: The tenant's games, grouped by location, date and time
 *     description: >
 *       Reads our stored copy, never the provider. Removed games are never listed and
 *       cancelled games are hidden unless include_cancelled is true. At most 2000 games are
 *       returned; truncated is then true and the earliest games are kept.
 *     parameters:
 *       - { in: query, name: scope, schema: { type: string, enum: [OPEN, MINE, ALL], default: OPEN } }
 *       - { in: query, name: from, description: Earliest start in UTC milliseconds (default now minus 3 hours), schema: { type: integer } }
 *       - { in: query, name: to, description: Latest start in UTC milliseconds (default now plus 120 days; at most 400 days after from), schema: { type: integer } }
 *       - { in: query, name: search, description: Case-insensitive text over teams, league, level, age group, venue, location and organization, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: connection_id, schema: { type: string } }
 *       - { in: query, name: organization_id, schema: { type: string } }
 *       - { in: query, name: league, schema: { type: string } }
 *       - { in: query, name: level, schema: { type: string } }
 *       - { in: query, name: age_group, schema: { type: string } }
 *       - { in: query, name: location_group, description: Exact location label ignoring case, schema: { type: string } }
 *       - { in: query, name: only_with_open_slots, schema: { type: string, enum: ['true', 'false'], default: 'false' } }
 *       - { in: query, name: include_cancelled, schema: { type: string, enum: ['true', 'false'], default: 'false' } }
 *     responses:
 *       200: { description: "The games: data.locations, data.total and data.truncated." }
 *       400: { description: Invalid query, or no tenant to act in. }
 *       403: { description: Requires the games.read permission. }
 * @param options Service and permission resolver.
 * @returns An Express router exposing `GET /games`.
 */
export function create_games_router(options: IGamesRoutesOptions): Router {
  const router = Router();
  router.get(
    '/games',
    require_app_permission(PermissionKey.GAMES_READ, options.permission_service),
    async (req, res, next) => {
      try {
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null) return;
        const query = parse_with_schema(options.games_service.query_schema, req.query);
        if (!query.ok) {
          send_api_error(
            res,
            400,
            ApiErrorCode.VALIDATION_ERROR,
            'The request is not valid',
            query.violations,
          );
          return;
        }
        res.json({ data: await options.games_service.list_games(tenant_id, query.data) });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
