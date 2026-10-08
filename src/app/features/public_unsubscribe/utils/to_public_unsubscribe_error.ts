import { HttpErrorResponse } from '@angular/common/http';
import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { PublicUnsubscribeError } from '../services/public_unsubscribe_error';

/** HTTP status for an unknown, expired or malformed link. */
const STATUS_NOT_FOUND = 404;
/** HTTP status for a visitor who is asking too often. */
const STATUS_TOO_MANY_REQUESTS = 429;

/**
 * Reduces a failed public call to its kind, status and API code, dropping the
 * address (which holds the token), headers and body.
 * @param error Whatever the HTTP client threw.
 * @returns The sanitized error.
 */
export function to_public_unsubscribe_error(error: unknown): PublicUnsubscribeError {
  if (!(error instanceof HttpErrorResponse)) {
    return new PublicUnsubscribeError(UnsubscribeErrorKind.UNAVAILABLE, 0);
  }
  const body: unknown = error.error;
  const code =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : null;
  if (error.status === STATUS_NOT_FOUND) {
    return new PublicUnsubscribeError(UnsubscribeErrorKind.NOT_VALID, error.status, code);
  }
  if (error.status === STATUS_TOO_MANY_REQUESTS) {
    return new PublicUnsubscribeError(UnsubscribeErrorKind.RATE_LIMITED, error.status, code);
  }
  return new PublicUnsubscribeError(UnsubscribeErrorKind.UNAVAILABLE, error.status, code);
}
