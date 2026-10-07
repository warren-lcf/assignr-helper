import type { Request, Response } from 'express';
import { ApiErrorCode } from './enums/api_error_code.enum.js';
import { send_api_error } from './send_api_error.js';

/**
 * Reads the tenant the request acts in. A platform administrator with no tenant
 * view has none, so tenant-owned routes answer 400 for them rather than guess.
 * Must run after the auth middleware.
 * @param req Express request.
 * @param res Express response, used to send the 400.
 * @returns The effective tenant id, or null after the 400 has been sent.
 */
export function require_tenant(req: Request, res: Response): string | null {
  const tenant_id = req.auth?.effective.tenant_id ?? null;
  if (tenant_id === null) {
    send_api_error(
      res,
      400,
      ApiErrorCode.TENANT_REQUIRED,
      'Choose a tenant to act in before using this route',
    );
  }
  return tenant_id;
}
