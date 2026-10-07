import { PublicQuickLinkError } from '../services/public_quick_link_error';

/**
 * Finds the sanitized error inside whatever a resource hands back (it wraps
 * the error its stream threw).
 * @param error Whatever the resource reported.
 * @returns The public error, or null when it is something else.
 */
export function unwrap_public_quick_link_error(error: unknown): PublicQuickLinkError | null {
  if (error instanceof PublicQuickLinkError) return error;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof PublicQuickLinkError ? cause : null;
}
