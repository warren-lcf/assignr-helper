import { HttpErrorResponse } from '@angular/common/http';
import { map_create_quick_link_error } from './map_create_quick_link_error';

const translate = (key: string) => key;

function api_error(
  code: string,
  violations: { path: string; message: string }[] = [],
): HttpErrorResponse {
  return new HttpErrorResponse({ status: 400, error: { code, message: 'English', violations } });
}

describe('map_create_quick_link_error', () => {
  it('puts each violation under its field, using the server wording', () => {
    const mapped = map_create_quick_link_error(
      api_error('VALIDATION_ERROR', [
        { path: 'scope.levels', message: 'Too many levels' },
        { path: 'scope.date_end', message: 'Before the start' },
        { path: 'date_start', message: 'Not a date' },
        { path: 'expires_at', message: 'Must be in the future' },
      ]),
      translate,
    );

    expect(mapped.field_errors).toEqual({
      levels: 'Too many levels',
      date_end: 'Before the start',
      date_start: 'Not a date',
      expiry: 'Must be in the future',
    });
    expect(mapped.form_error).toBeNull();
  });

  it('keeps the first message per field and collects unknown paths for the form', () => {
    const mapped = map_create_quick_link_error(
      api_error('VALIDATION_ERROR', [
        { path: 'levels', message: 'First' },
        { path: 'levels', message: 'Second' },
        { path: 'something_else', message: 'Odd' },
      ]),
      translate,
    );

    expect(mapped.field_errors).toEqual({ levels: 'First' });
    expect(mapped.form_error).toBe('Odd');
  });

  it('falls back to a generic validation message when the server names nothing', () => {
    expect(map_create_quick_link_error(api_error('VALIDATION_ERROR'), translate)).toEqual({
      field_errors: {},
      form_error: 'Check the details and try again.',
    });
  });

  it.each([
    ['PERMISSION_REQUIRED', 'You do not have permission to manage quick links.'],
    ['TENANT_REQUIRED', 'Choose a tenant to act in, then try again.'],
    ['RATE_LIMITED', 'Too many requests. Wait a moment and try again.'],
    ['SOMETHING_NEW', 'Something went wrong. Try again.'],
  ])('maps %s to the app wording', (code, message) => {
    expect(map_create_quick_link_error(api_error(code), translate)).toEqual({
      field_errors: {},
      form_error: message,
    });
  });

  it('treats a network error (no body) as a generic failure', () => {
    expect(
      map_create_quick_link_error(
        new HttpErrorResponse({ status: 0, error: new Error('x') }),
        translate,
      ).form_error,
    ).toBe('Something went wrong. Try again.');
  });
});
