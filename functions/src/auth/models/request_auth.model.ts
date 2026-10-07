import { IAuthContext } from './auth_context.model.js';

/**
 * What the auth middleware attaches to `req.auth`. Authorization decisions use
 * `effective`; audit rows record both so an assumed role or tenant stays visible.
 */
export interface IRequestAuth {
  /** The caller's real identity, role and tenant. */
  real: IAuthContext;
  /** What the request acts as after any role downgrade or tenant impersonation. */
  effective: IAuthContext;
}
