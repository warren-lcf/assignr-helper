import type { Request } from 'express';
import { IActingUser } from './models/acting_user.model.js';

/**
 * Builds the acting identity for stamps and the audit trail.
 * @param req Express request, after the auth middleware.
 * @param tenant_id Tenant being acted in.
 * @returns The actor: the real person, with the actual and effective roles.
 */
export function to_acting_user(req: Request, tenant_id: string): IActingUser {
  const auth = req.auth;
  return {
    tenant_id,
    user_id: auth?.real.uid ?? '',
    actual_role: auth?.real.role ?? '',
    effective_role: auth?.effective.role ?? '',
  };
}
