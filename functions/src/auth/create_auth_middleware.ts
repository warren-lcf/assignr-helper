import {
  create_role_switcher,
  create_tenant_impersonator,
} from '@hch-shared-libraries/core-server';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppRole } from './enums/app_role.enum.js';
import { AuthErrorCode } from './enums/auth_error_code.enum.js';
import { extract_bearer_token } from './extract_bearer_token.js';
import { IAuthContext } from './models/auth_context.model.js';
import { IAuthMiddlewareOptions } from './models/auth_middleware_options.model.js';
import { IVerifiedToken } from './models/verified_token.model.js';
import { send_auth_error } from './send_auth_error.js';

/** Selects which of the caller's tenants to act in (they must be a member). */
export const TENANT_HEADER = 'x-tenant-id';

/** Platform administrators only: view the app as another tenant. */
export const ACTING_TENANT_HEADER = 'x-acting-tenant-id';

/** View the app as a lower role than the caller's own. */
export const EFFECTIVE_ROLE_HEADER = 'x-effective-role';

const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Result of reading one optional header: absent, a usable value, or malformed. */
type HeaderRead = { kind: 'absent' } | { kind: 'value'; value: string } | { kind: 'malformed' };

function read_header(req: Request, name: string): HeaderRead {
  const raw = req.headers[name];
  if (raw === undefined || raw === '') return { kind: 'absent' };
  if (typeof raw !== 'string') return { kind: 'malformed' };
  return { kind: 'value', value: raw };
}

/**
 * Builds the auth middleware. For every request it verifies the bearer ID
 * token, resolves the caller's tenant and role, then applies core-server's
 * tenant impersonation (platform administrators only) and role downgrade
 * (assumable roles only), and attaches both the real and the effective context
 * as `req.auth`. It fails closed: any missing or doubtful step ends the
 * request before a handler runs.
 *
 * Mount public routers BEFORE this middleware and protected ones after it.
 * @param options Token verifier, membership resolver and permission service.
 * @returns Express middleware.
 */
export function create_auth_middleware(options: IAuthMiddlewareOptions): RequestHandler {
  const impersonator = create_tenant_impersonator<IAuthContext>({
    header_name: ACTING_TENANT_HEADER,
    is_impersonation_allowed: (context) => context.role === AppRole.PLATFORM_ADMIN,
  });
  // The header's value is checked against the caller's assumable roles below,
  // before the switcher sees it, so the switcher itself may always proceed.
  const role_switcher = create_role_switcher<IAuthContext>({
    header_name: EFFECTIVE_ROLE_HEADER,
    is_downgrade_allowed: () => true,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extract_bearer_token(req.headers.authorization);
      if (!token) {
        send_auth_error(res, 401, AuthErrorCode.AUTHENTICATION_REQUIRED, 'Sign in to continue');
        return;
      }

      let verified: IVerifiedToken | null;
      try {
        verified = await options.token_verifier.verify(token);
      } catch (error) {
        console.error('Token verification is unavailable', error);
        send_auth_error(
          res,
          503,
          AuthErrorCode.AUTH_UNAVAILABLE,
          'Sign-in is temporarily unavailable',
        );
        return;
      }
      if (!verified) {
        send_auth_error(res, 401, AuthErrorCode.INVALID_TOKEN, 'The sign-in token is not valid');
        return;
      }

      const tenant_header = read_header(req, TENANT_HEADER);
      const acting_header = read_header(req, ACTING_TENANT_HEADER);
      const role_header = read_header(req, EFFECTIVE_ROLE_HEADER);
      for (const header of [tenant_header, acting_header]) {
        if (
          header.kind === 'malformed' ||
          (header.kind === 'value' && !TENANT_ID_PATTERN.test(header.value))
        ) {
          send_auth_error(
            res,
            400,
            AuthErrorCode.INVALID_TENANT_HEADER,
            'The tenant header is not valid',
          );
          return;
        }
      }

      const membership = await options.membership_resolver.resolve(
        verified.uid,
        tenant_header.kind === 'value' ? tenant_header.value : null,
      );
      if (!membership) {
        send_auth_error(
          res,
          403,
          AuthErrorCode.NO_MEMBERSHIP,
          'You are not a member of this tenant',
        );
        return;
      }

      const real: IAuthContext = {
        uid: verified.uid,
        email: verified.email,
        ...(verified.email_verified === undefined
          ? {}
          : { email_verified: verified.email_verified }),
        tenant_id: membership.tenant_id,
        role: membership.role,
      };

      if (acting_header.kind === 'value' && real.role !== AppRole.PLATFORM_ADMIN) {
        send_auth_error(
          res,
          403,
          AuthErrorCode.PERMISSION_REQUIRED,
          'Only platform administrators may act as another tenant',
        );
        return;
      }
      if (role_header.kind !== 'absent') {
        const assumable = await options.role_permission_service.get_assumable_role_slugs(real.role);
        if (role_header.kind === 'malformed' || !assumable.has(role_header.value)) {
          send_auth_error(
            res,
            403,
            AuthErrorCode.ROLE_NOT_ASSUMABLE,
            'You cannot act as that role',
          );
          return;
        }
      }

      req.auth = { real, effective: role_switcher.apply(impersonator.apply(real, req), req) };
      next();
    } catch (error) {
      console.error('Auth middleware failed', error);
      send_auth_error(
        res,
        503,
        AuthErrorCode.AUTH_UNAVAILABLE,
        'Sign-in is temporarily unavailable',
      );
    }
  };
}
