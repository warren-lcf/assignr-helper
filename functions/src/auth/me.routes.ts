import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';

/**
 * Builds the route that tells the signed-in app who it is acting as.
 * @openapi
 * /api/me:
 *   get:
 *     summary: The caller's identity, effective tenant and role, and permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The effective context. `actual_*` fields show the real identity when acting as another role or tenant.
 *       401:
 *         description: Not signed in.
 *       403:
 *         description: Signed in but not a member of any tenant.
 * @param permission_service Resolves a role's permission keys.
 * @returns An Express router exposing `GET /me`; mount it after the auth middleware.
 */
export function create_me_router(permission_service: RolePermissionService): Router {
  const router = Router();
  router.get('/me', async (req, res, next) => {
    try {
      const auth = req.auth;
      if (!auth) {
        res.status(401).json({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Sign in to continue',
          violations: [],
        });
        return;
      }
      const permissions = [
        ...(await permission_service.get_permission_keys(auth.effective.role)),
      ].sort();
      res.json({
        data: {
          uid: auth.effective.uid,
          email: auth.effective.email,
          tenant_id: auth.effective.tenant_id,
          role: auth.effective.role,
          actual_tenant_id: auth.real.tenant_id,
          actual_role: auth.real.role,
          permissions,
        },
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
