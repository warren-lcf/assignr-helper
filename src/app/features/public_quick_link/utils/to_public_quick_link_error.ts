import { HttpErrorResponse } from '@angular/common/http';
import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { PublicQuickLinkError } from '../services/public_quick_link_error';
import { parse_retry_after } from './parse_retry_after';

/** HTTP status for an unknown, expired, revoked or malformed link. */
const STATUS_NOT_FOUND = 404;
/** HTTP status for a visitor who is asking too often. */
const STATUS_TOO_MANY_REQUESTS = 429;

/**
 * Reduces a failed public call to its kind, status and API code, dropping the
 * address (which holds the token), headers and body.
 * @param error Whatever the HTTP client threw.
 * @returns The sanitized error.
 */
export function to_public_quick_link_error(error: unknown): PublicQuickLinkError {
  if (!(error instanceof HttpErrorResponse)) {
    return new PublicQuickLinkError(PublicLinkErrorKind.UNAVAILABLE, 0);
  }
  const body: unknown = error.error;
  const code =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : null;
  if (error.status === STATUS_NOT_FOUND) {
    return new PublicQuickLinkError(PublicLinkErrorKind.NOT_ACTIVE, error.status, code);
  }
  if (error.status === STATUS_TOO_MANY_REQUESTS) {
    return new PublicQuickLinkError(
      PublicLinkErrorKind.RATE_LIMITED,
      error.status,
      code,
      parse_retry_after(error.headers.get('Retry-After')),
    );
  }
  return new PublicQuickLinkError(PublicLinkErrorKind.UNAVAILABLE, error.status, code);
}
