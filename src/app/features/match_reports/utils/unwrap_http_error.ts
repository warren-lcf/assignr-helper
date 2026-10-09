import { HttpErrorResponse } from '@angular/common/http';

/**
 * A resource wraps the error it was given; the API's error body lives on the original HTTP error.
 * @param error Whatever a call (or the resource around it) threw.
 * @returns The HTTP error when there is one, otherwise the input.
 */
export function unwrap_http_error(error: unknown): unknown {
  if (error instanceof HttpErrorResponse) return error;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof HttpErrorResponse ? cause : error;
}
