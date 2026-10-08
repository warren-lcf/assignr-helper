import { parse_api_error } from '../../connections/services/parse_api_error';
import { EmailApiErrorCode } from '../enums/email_api_error_code.enum';
import { IMappedEmailError } from '../models/mapped_email_error.model';

/** Translates an English key. */
type Translate = (key: string) => string;

/** Name of the field a violation path points at: the last segment, so `filters.level` is `level`. */
function field_of(path: string): string {
  return path.split('.').pop() ?? path;
}

/**
 * Turns a failed email API call into messages for a dialog or screen. A 400
 * goes under the field each violation names (the server's wording is used for
 * those); every other failure is the app's own translated message, never the
 * server's English text.
 * @param error Whatever the API call threw.
 * @param translate Translates an English key.
 * @param known_fields Request fields the caller can show an error under.
 * @returns The messages to show, and the API's error code for callers that branch on it.
 */
export function map_email_api_error(
  error: unknown,
  translate: Translate,
  known_fields: readonly string[] = [],
): IMappedEmailError {
  const body = parse_api_error(error);
  const code = body?.code ?? null;
  const form = (message: string): IMappedEmailError => ({
    code,
    field_errors: {},
    form_error: translate(message),
  });

  switch (code) {
    case EmailApiErrorCode.VALIDATION_ERROR:
      return map_violations(code, body?.violations ?? [], translate, known_fields);
    case EmailApiErrorCode.CONTACT_EXISTS:
      return {
        code,
        field_errors: {
          email_address: translate('A contact with this email address already exists.'),
        },
        form_error: null,
      };
    case EmailApiErrorCode.PERMISSION_REQUIRED:
      return form('You do not have permission to send email.');
    case EmailApiErrorCode.TENANT_REQUIRED:
      return form('Choose a tenant to act in, then try again.');
    case EmailApiErrorCode.RATE_LIMITED:
      return form('Too many requests. Wait a moment and try again.');
    case EmailApiErrorCode.NOT_FOUND:
      return form('This no longer exists. Close this and refresh the page.');
    case EmailApiErrorCode.DRAFT_LOCKED:
      return form('This draft has already been sent and can no longer be changed.');
    case EmailApiErrorCode.EMAIL_NOT_CONFIGURED:
      return form('Sending is not set up yet. Add your sender settings first.');
    case EmailApiErrorCode.NO_RECIPIENTS:
      return form('Nobody would receive this email.');
    case EmailApiErrorCode.TOO_MANY_RECIPIENTS:
      return form('One send can reach at most 100 people.');
    case EmailApiErrorCode.NO_GAMES:
      return form('No open games match this draft.');
    case EmailApiErrorCode.RECIPIENT_COUNT_CHANGED:
      return form('The number of recipients changed. Review the preview and confirm again.');
    case EmailApiErrorCode.NO_EMAIL_ON_ACCOUNT:
      return form('Your account has no email address to send the test to.');
    default:
      return form('Something went wrong. Try again.');
  }
}

function map_violations(
  code: string,
  violations: readonly { path: string; message: string }[],
  translate: Translate,
  known_fields: readonly string[],
): IMappedEmailError {
  const field_errors: Record<string, string> = {};
  const loose: string[] = [];
  for (const violation of violations) {
    const field = field_of(violation.path);
    if (known_fields.includes(field)) field_errors[field] ??= violation.message;
    else loose.push(violation.message);
  }
  const has_any = Object.keys(field_errors).length > 0 || loose.length > 0;
  return {
    code,
    field_errors,
    form_error: has_any ? loose.join(' ') || null : translate('Check the details and try again.'),
  };
}
