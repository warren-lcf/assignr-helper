import { HttpErrorResponse } from '@angular/common/http';
import { EmailApiErrorCode } from '../enums/email_api_error_code.enum';
import { map_email_api_error } from './map_email_api_error';

const translate = (key: string): string => `T(${key})`;

function failure(code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 400,
    error: { code, message: 'server english', violations },
  });
}

describe('map_email_api_error', () => {
  it('puts a violation under its field, using the last path segment', () => {
    const mapped = map_email_api_error(
      failure(EmailApiErrorCode.VALIDATION_ERROR, [
        { path: 'filters.level', message: 'Too long' },
        { path: 'subject', message: 'Required' },
      ]),
      translate,
      ['subject', 'level'],
    );

    expect(mapped.field_errors).toEqual({ level: 'Too long', subject: 'Required' });
    expect(mapped.form_error).toBeNull();
    expect(mapped.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the first message for a field and joins the ones with no field', () => {
    const mapped = map_email_api_error(
      failure(EmailApiErrorCode.VALIDATION_ERROR, [
        { path: 'subject', message: 'first' },
        { path: 'subject', message: 'second' },
        { path: 'weird', message: 'loose one' },
        { path: 'other', message: 'loose two' },
      ]),
      translate,
      ['subject'],
    );

    expect(mapped.field_errors).toEqual({ subject: 'first' });
    expect(mapped.form_error).toBe('loose one loose two');
  });

  it('falls back to a translated message for a validation error with no violations', () => {
    const mapped = map_email_api_error(failure(EmailApiErrorCode.VALIDATION_ERROR), translate);

    expect(mapped.form_error).toBe('T(Check the details and try again.)');
  });

  it('puts an existing contact under the address field', () => {
    const mapped = map_email_api_error(failure(EmailApiErrorCode.CONTACT_EXISTS), translate);

    expect(mapped.field_errors['email_address']).toBe(
      'T(A contact with this email address already exists.)',
    );
    expect(mapped.form_error).toBeNull();
  });

  it.each([
    [EmailApiErrorCode.PERMISSION_REQUIRED, 'You do not have permission to send email.'],
    [EmailApiErrorCode.TENANT_REQUIRED, 'Choose a tenant to act in, then try again.'],
    [EmailApiErrorCode.RATE_LIMITED, 'Too many requests. Wait a moment and try again.'],
    [EmailApiErrorCode.NOT_FOUND, 'This no longer exists. Close this and refresh the page.'],
    [
      EmailApiErrorCode.DRAFT_LOCKED,
      'This draft has already been sent and can no longer be changed.',
    ],
    [
      EmailApiErrorCode.EMAIL_NOT_CONFIGURED,
      'Sending is not set up yet. Add your sender settings first.',
    ],
    [EmailApiErrorCode.NO_RECIPIENTS, 'Nobody would receive this email.'],
    [EmailApiErrorCode.TOO_MANY_RECIPIENTS, 'One send can reach at most 100 people.'],
    [EmailApiErrorCode.NO_GAMES, 'No open games match this draft.'],
    [
      EmailApiErrorCode.RECIPIENT_COUNT_CHANGED,
      'The number of recipients changed. Review the preview and confirm again.',
    ],
    [
      EmailApiErrorCode.NO_EMAIL_ON_ACCOUNT,
      'Your account has no email address to send the test to.',
    ],
  ])('translates %s and never shows the server wording', (code, english) => {
    const mapped = map_email_api_error(failure(code), translate);

    expect(mapped.code).toBe(code);
    expect(mapped.form_error).toBe(`T(${english})`);
    expect(JSON.stringify(mapped)).not.toContain('server english');
  });

  it('gives the generic message for an unknown code, a bare error or no body', () => {
    expect(map_email_api_error(failure('SOMETHING_NEW'), translate).form_error).toBe(
      'T(Something went wrong. Try again.)',
    );
    expect(map_email_api_error(new Error('boom'), translate)).toEqual({
      code: null,
      field_errors: {},
      form_error: 'T(Something went wrong. Try again.)',
    });
  });
});
