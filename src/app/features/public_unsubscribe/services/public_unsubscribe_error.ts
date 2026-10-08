import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';

/**
 * A failed public unsubscribe call, stripped of everything that could carry
 * the link secret. The address of the call contains the token, and Angular's
 * `HttpErrorResponse` keeps that address (and the whole response), so the
 * service converts every failure into this class and nothing downstream, a
 * log line included, ever sees the original.
 */
export class PublicUnsubscribeError extends Error {
  /**
   * @param kind What went wrong, as far as the page distinguishes.
   * @param status The HTTP status; 0 for a network failure.
   * @param code The API error code when the body had one, otherwise null.
   */
  public constructor(
    public readonly kind: UnsubscribeErrorKind,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(`Public unsubscribe request failed (${kind}, status ${status})`);
    this.name = 'PublicUnsubscribeError';
  }
}
