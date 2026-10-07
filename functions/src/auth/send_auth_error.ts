import type { Response } from 'express';
import { AuthErrorCode } from './enums/auth_error_code.enum.js';

/**
 * Sends the API's standard error envelope for an auth failure.
 * @param response Express response.
 * @param status HTTP status.
 * @param code Machine-readable reason.
 * @param message Human-readable explanation; never includes token or user data.
 * @returns Nothing; the response is finished.
 */
export function send_auth_error(
  response: Response,
  status: number,
  code: AuthErrorCode,
  message: string,
): void {
  response.status(status).json({ code, message, violations: [] });
}
