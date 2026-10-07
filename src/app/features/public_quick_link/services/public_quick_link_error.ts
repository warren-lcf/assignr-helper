import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';

/**
 * A failed public call, stripped of everything that could carry the link's
 * secret. The address of a public call contains the token, and Angular's
 * `HttpErrorResponse` keeps that address (and the whole response), so the
 * service converts every failure into this class and nothing downstream, a
 * log line included, ever sees the original.
 */
export class PublicQuickLinkError extends Error {
  /**
   * @param kind What went wrong, as far as the page distinguishes.
   * @param status The HTTP status; 0 for a network failure.
   * @param code The API's error code when the body had one, otherwise null.
   * @param retry_after_ms How long the server asked the visitor to wait (429 only), or null.
   */
  public constructor(
    public readonly kind: PublicLinkErrorKind,
    public readonly status: number,
    public readonly code: string | null = null,
    public readonly retry_after_ms: number | null = null,
  ) {
    super(`Public quick link request failed (${kind}, status ${status})`);
    this.name = 'PublicQuickLinkError';
  }
}
