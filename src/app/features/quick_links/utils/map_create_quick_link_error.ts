import { parse_api_error } from '../../connections/services/parse_api_error';
import { QuickLinksApiErrorCode } from '../enums/quick_links_api_error_code.enum';
import { IMappedCreateError } from '../models/mapped_create_error.model';

/** Which form field each request field belongs to. */
const FIELD_FOR_PATH: Readonly<Record<string, keyof IMappedCreateError['field_errors']>> = {
  levels: 'levels',
  'scope.levels': 'levels',
  date_start: 'date_start',
  'scope.date_start': 'date_start',
  date_end: 'date_end',
  'scope.date_end': 'date_end',
  expires_at: 'expiry',
};

/**
 * Turns a failed create call into messages for the dialog: a rejected value
 * goes under its field (the server's wording is used for those), everything
 * else is the app's own translated message for the form as a whole.
 * @param error Whatever the call threw.
 * @param translate Translates an English key.
 * @returns The messages to show.
 */
export function map_create_quick_link_error(
  error: unknown,
  translate: (key: string) => string,
): IMappedCreateError {
  const body = parse_api_error(error);
  switch (body?.code) {
    case QuickLinksApiErrorCode.VALIDATION_ERROR: {
      const field_errors: IMappedCreateError['field_errors'] = {};
      const loose: string[] = [];
      for (const violation of body.violations) {
        const field = FIELD_FOR_PATH[violation.path];
        if (field) field_errors[field] ??= violation.message;
        else loose.push(violation.message);
      }
      const has_any = Object.keys(field_errors).length > 0 || loose.length > 0;
      return {
        field_errors,
        form_error: has_any
          ? loose.join(' ') || null
          : translate('Check the details and try again.'),
      };
    }
    case QuickLinksApiErrorCode.PERMISSION_REQUIRED:
      return {
        field_errors: {},
        form_error: translate('You do not have permission to manage quick links.'),
      };
    case QuickLinksApiErrorCode.TENANT_REQUIRED:
      return {
        field_errors: {},
        form_error: translate('Choose a tenant to act in, then try again.'),
      };
    case QuickLinksApiErrorCode.RATE_LIMITED:
      return {
        field_errors: {},
        form_error: translate('Too many requests. Wait a moment and try again.'),
      };
    default:
      return { field_errors: {}, form_error: translate('Something went wrong. Try again.') };
  }
}
