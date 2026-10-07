import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import type { RequestHandler } from 'express';

/** The auth pieces the Express app mounts; supplied by the composition root. */
export interface IAppAuth {
  /** Verifies the caller and attaches `req.auth`. */
  middleware: RequestHandler;
  /** Resolves permission keys for a role. */
  permission_service: RolePermissionService;
}
