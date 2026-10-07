import { ApiErrorCode } from '../enums/api_error_code.enum';
import { IMappedApiError } from '../models/mapped_api_error.model';
import { parse_api_error } from './parse_api_error';

/** Request fields the credential dialogs show errors under. */
const CREDENTIAL_FIELDS: readonly string[] = ['provider', 'client_id', 'client_secret'];

/**
 * Turns a failed add-connection or replace-credentials call into messages for
 * the dialog: a rejected secret sits under the secret field, a 400 goes under
 * the field named by each violation's `path`, everything else is a message for
 * the form as a whole. The server's English wording is only used for
 * violations; every other message is the app's own translated text.
 * @param error Whatever the API call threw.
 * @param translate Translates an English key.
 * @returns The messages to show.
 */
export function map_credentials_api_error(
  error: unknown,
  translate: (key: string) => string,
): IMappedApiError {
  const body = parse_api_error(error);
  switch (body?.code) {
    case ApiErrorCode.CREDENTIALS_REJECTED:
      return {
        field_errors: { client_secret: translate('The provider did not accept these credentials') },
        form_error: null,
      };
    case ApiErrorCode.ACCOUNT_MISMATCH:
      return {
        field_errors: {},
        form_error: translate(
          'These credentials belong to a different account. Add a new connection instead.',
        ),
      };
    case ApiErrorCode.PROVIDER_UNAVAILABLE:
      return {
        field_errors: {},
        form_error: translate('Assignr could not be reached. Try again shortly.'),
      };
    case ApiErrorCode.PERMISSION_REQUIRED:
      return {
        field_errors: {},
        form_error: translate('You do not have permission to manage connections.'),
      };
    case ApiErrorCode.TENANT_REQUIRED:
      return {
        field_errors: {},
        form_error: translate('Choose a tenant to act in, then try again.'),
      };
    case ApiErrorCode.NOT_FOUND:
      return {
        field_errors: {},
        form_error: translate('This connection no longer exists. Close this and refresh the page.'),
      };
    case ApiErrorCode.VALIDATION_ERROR:
      return map_violations(body.violations, translate);
    default:
      return {
        field_errors: {},
        form_error: translate('Something went wrong. Try again.'),
      };
  }
}

function map_violations(
  violations: { path: string; message: string }[],
  translate: (key: string) => string,
): IMappedApiError {
  const field_errors: Record<string, string> = {};
  const loose: string[] = [];
  for (const violation of violations) {
    if (CREDENTIAL_FIELDS.includes(violation.path)) {
      field_errors[violation.path] ??= violation.message;
    } else {
      loose.push(violation.message);
    }
  }
  const has_any = Object.keys(field_errors).length > 0 || loose.length > 0;
  return {
    field_errors,
    form_error: has_any ? loose.join(' ') || null : translate('Check the details and try again.'),
  };
}
