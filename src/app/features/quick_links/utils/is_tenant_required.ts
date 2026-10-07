import { HttpErrorResponse } from '@angular/common/http';
import { parse_api_error } from '../../connections/services/parse_api_error';
import { QuickLinksApiErrorCode } from '../enums/quick_links_api_error_code.enum';

/**
 * Whether a failed load was a platform administrator who has not picked a
 * tenant to act in. A resource wraps the error it was given, so the original
 * HTTP error is looked up on its `cause` too.
 * @param error Whatever the load threw.
 * @returns True for a missing tenant.
 */
export function is_tenant_required(error: unknown): boolean {
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  const http_error = error instanceof HttpErrorResponse ? error : cause;
  return parse_api_error(http_error)?.code === QuickLinksApiErrorCode.TENANT_REQUIRED;
}
