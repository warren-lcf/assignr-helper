import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { IMembershipResolver } from '../ports/membership_resolver.interface.js';
import { ITokenVerifier } from '../ports/token_verifier.interface.js';

/** Dependencies of the auth middleware. */
export interface IAuthMiddlewareOptions {
  token_verifier: ITokenVerifier;
  membership_resolver: IMembershipResolver;
  /** Used to check that an "act as role" request only names a role the caller may assume. */
  role_permission_service: RolePermissionService;
}
