import { HttpErrorResponse } from '@angular/common/http';
import { IApiErrorBody } from '../models/api_error_body.model';
import { IApiViolation } from '../models/api_violation.model';

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the API's error body (`{ code, message, violations }`) out of a failed
 * HTTP call.
 * @param error Whatever a call to the API threw.
 * @returns The body, or null when the failure carries none (network error, proxy page, wrong shape).
 */
export function parse_api_error(error: unknown): IApiErrorBody | null {
  if (!(error instanceof HttpErrorResponse) || !is_record(error.error)) return null;
  const { code, message, violations } = error.error;
  if (typeof code !== 'string') return null;
  const parsed_violations: IApiViolation[] = Array.isArray(violations)
    ? violations.filter(
        (item): item is IApiViolation =>
          is_record(item) &&
          typeof item['path'] === 'string' &&
          typeof item['message'] === 'string',
      )
    : [];
  return {
    code,
    message: typeof message === 'string' ? message : '',
    violations: parsed_violations,
  };
}
