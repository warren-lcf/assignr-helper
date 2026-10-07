import type { Response } from 'express';
import { ApiErrorCode } from './enums/api_error_code.enum.js';
import { IViolation } from './models/violation.model.js';

/**
 * Sends the API's standard error envelope.
 * @param response Express response.
 * @param status HTTP status.
 * @param code Machine-readable reason.
 * @param message Human-readable explanation; never includes secrets or other tenants' data.
 * @param violations Field-level problems, for validation errors.
 * @returns Nothing; the response is finished.
 */
export function send_api_error(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  violations: IViolation[] = [],
): void {
  response.status(status).json({ code, message, violations });
}
