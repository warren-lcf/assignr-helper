import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { IMappedPublicError } from '../models/mapped_public_error.model';

/**
 * The heading and advice for each kind of failure. The "not active" wording is
 * the same for an unknown, expired, revoked or malformed link: it must never
 * hint at which one it was.
 * @param kind What went wrong.
 * @param translate Translates an English key.
 * @returns The messages to show.
 */
export function map_public_link_error(
  kind: PublicLinkErrorKind,
  translate: (key: string) => string,
): IMappedPublicError {
  switch (kind) {
    case PublicLinkErrorKind.NOT_ACTIVE:
      return {
        kind,
        headline: translate('This link is no longer active'),
        description: translate('Ask the person who sent it for a new one.'),
      };
    case PublicLinkErrorKind.RATE_LIMITED:
      return {
        kind,
        headline: translate('Too many requests'),
        description: translate('Please try again in a moment.'),
      };
    default:
      return {
        kind,
        headline: translate('Games could not be loaded'),
        description: translate('Check your connection and try again.'),
      };
  }
}
