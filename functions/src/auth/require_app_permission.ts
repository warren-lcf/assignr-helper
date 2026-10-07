import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthErrorCode } from './enums/auth_error_code.enum.js';
import { PermissionKey } from './enums/permission_key.enum.js';
import { send_auth_error } from './send_auth_error.js';

/**
 * Gates a route behind a permission, checked against the caller's EFFECTIVE
 * role (so "view as a lower role" really does remove access). Reuses
 * core-server's permission service but answers in this API's error envelope.
 * Must be mounted after the auth middleware.
 * @param permission_key Permission the route needs.
 * @param service Permission service.
 * @returns Express middleware.
 */
export function require_app_permission(
  permission_key: PermissionKey,
  service: RolePermissionService,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      send_auth_error(res, 401, AuthErrorCode.AUTHENTICATION_REQUIRED, 'Sign in to continue');
      return;
    }
    try {
      if (await service.role_has_permission(auth.effective.role, permission_key)) {
        next();
        return;
      }
      send_auth_error(
        res,
        403,
        AuthErrorCode.PERMISSION_REQUIRED,
        `Your role does not allow this action (${permission_key})`,
      );
    } catch (error) {
      console.error('Permission check failed', error);
      send_auth_error(
        res,
        503,
        AuthErrorCode.AUTH_UNAVAILABLE,
        'Sign-in is temporarily unavailable',
      );
    }
  };
}
