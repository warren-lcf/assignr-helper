import { parse_api_error } from '../../connections/services/parse_api_error';
import { unwrap_http_error } from '../../match_reports/utils/unwrap_http_error';
import { FeedApiErrorCode } from '../enums/feed_api_error_code.enum';
import { FeedErrorKind } from '../enums/feed_error_kind.enum';
import { IMappedFeedError } from '../models/mapped_feed_error.model';

/**
 * Turns a failed calendar feed call into the sentence the screen shows. The server's English wording
 * is never shown, and nothing from the request (which could carry a secret) is put in the message.
 * @param error Whatever the call (or the resource around it) threw.
 * @param translate Translates an English key.
 * @param fallback_message The translated sentence for a failure that has no special meaning.
 * @returns The kind of failure and its message.
 */
export function map_feed_api_error(
  error: unknown,
  translate: (key: string) => string,
  fallback_message: string,
): IMappedFeedError {
  switch (parse_api_error(unwrap_http_error(error))?.code) {
    case FeedApiErrorCode.TENANT_REQUIRED:
      return {
        kind: FeedErrorKind.TENANT_REQUIRED,
        message: translate('Pick the tenant to act in from the header, then try again.'),
      };
    case FeedApiErrorCode.PERMISSION_REQUIRED:
      return {
        kind: FeedErrorKind.PERMISSION_REQUIRED,
        message: translate('Your role cannot manage the calendar link.'),
      };
    case FeedApiErrorCode.FEED_EXISTS:
      return {
        kind: FeedErrorKind.ALREADY_EXISTS,
        message: translate(
          'You already have a calendar link. To get a new address, rotate the existing one.',
        ),
      };
    case FeedApiErrorCode.NOT_FOUND:
      return {
        kind: FeedErrorKind.NOT_FOUND,
        message: translate('There is no calendar link to change. It may have been revoked.'),
      };
    default:
      return { kind: FeedErrorKind.GENERIC, message: fallback_message };
  }
}
