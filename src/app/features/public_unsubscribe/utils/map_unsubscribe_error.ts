import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { IMappedUnsubscribeError } from '../models/mapped_unsubscribe_error.model';

/**
 * The heading and advice for each kind of failure. The "not valid" wording is
 * the same for an unknown, expired or malformed link: it must never hint at
 * which one it was.
 * @param kind What went wrong.
 * @param translate Translates an English key.
 * @returns The messages to show.
 */
export function map_unsubscribe_error(
  kind: UnsubscribeErrorKind,
  translate: (key: string) => string,
): IMappedUnsubscribeError {
  switch (kind) {
    case UnsubscribeErrorKind.NOT_VALID:
      return {
        kind,
        headline: translate('This link is not valid'),
        description: translate('Check that you opened the whole link from the email.'),
      };
    case UnsubscribeErrorKind.RATE_LIMITED:
      return {
        kind,
        headline: translate('Too many requests'),
        description: translate('Please wait a moment and try again.'),
      };
    default:
      return {
        kind,
        headline: translate('Something went wrong'),
        description: translate('Check your connection and try again.'),
      };
  }
}
