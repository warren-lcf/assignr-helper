import { PublicUnsubscribeError } from '../services/public_unsubscribe_error';

/**
 * Finds the sanitized error inside whatever a resource hands back (it wraps
 * the error its stream threw).
 * @param error Whatever the resource reported.
 * @returns The public error, or null when it is something else.
 */
export function unwrap_public_unsubscribe_error(error: unknown): PublicUnsubscribeError | null {
  if (error instanceof PublicUnsubscribeError) return error;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof PublicUnsubscribeError ? cause : null;
}
