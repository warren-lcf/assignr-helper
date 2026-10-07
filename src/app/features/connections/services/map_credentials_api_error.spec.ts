import { HttpErrorResponse } from '@angular/common/http';
import { map_credentials_api_error } from './map_credentials_api_error';

const translate = (key: string) => key;

function failure(code: string, status: number, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

describe('map_credentials_api_error', () => {
  it('puts a rejected credential under the secret field', () => {
    expect(map_credentials_api_error(failure('CREDENTIALS_REJECTED', 422), translate)).toEqual({
      field_errors: { client_secret: 'The provider did not accept these credentials' },
      form_error: null,
    });
  });

  it('explains an account mismatch for the form as a whole', () => {
    const mapped = map_credentials_api_error(failure('ACCOUNT_MISMATCH', 409), translate);

    expect(mapped.field_errors).toEqual({});
    expect(mapped.form_error).toBe(
      'These credentials belong to a different account. Add a new connection instead.',
    );
  });

  it('asks to try again when the provider is unavailable', () => {
    expect(
      map_credentials_api_error(failure('PROVIDER_UNAVAILABLE', 502), translate).form_error,
    ).toBe('Assignr could not be reached. Try again shortly.');
  });

  it('maps permission, tenant and not-found failures to form messages', () => {
    expect(
      map_credentials_api_error(failure('PERMISSION_REQUIRED', 403), translate).form_error,
    ).toBe('You do not have permission to manage connections.');
    expect(map_credentials_api_error(failure('TENANT_REQUIRED', 400), translate).form_error).toBe(
      'Choose a tenant to act in, then try again.',
    );
    expect(map_credentials_api_error(failure('NOT_FOUND', 404), translate).form_error).toBe(
      'This connection no longer exists. Close this and refresh the page.',
    );
  });

  it('maps violations to fields by path, keeping the first per field', () => {
    const mapped = map_credentials_api_error(
      failure('VALIDATION_ERROR', 400, [
        { path: 'client_id', message: 'Required' },
        { path: 'client_id', message: 'Too long' },
        { path: 'client_secret', message: 'Too long' },
      ]),
      translate,
    );

    expect(mapped).toEqual({
      field_errors: { client_id: 'Required', client_secret: 'Too long' },
      form_error: null,
    });
  });

  it('shows violations for unknown paths on the form', () => {
    const mapped = map_credentials_api_error(
      failure('VALIDATION_ERROR', 400, [{ path: 'body', message: 'Must be an object' }]),
      translate,
    );

    expect(mapped.field_errors).toEqual({});
    expect(mapped.form_error).toBe('Must be an object');
  });

  it('falls back to a generic message for a 400 with no violations', () => {
    expect(map_credentials_api_error(failure('VALIDATION_ERROR', 400), translate).form_error).toBe(
      'Check the details and try again.',
    );
  });

  it('falls back to a generic message for unknown codes and non-API failures', () => {
    const generic = 'Something went wrong. Try again.';

    expect(map_credentials_api_error(failure('NEW_CODE', 500), translate).form_error).toBe(generic);
    expect(
      map_credentials_api_error(new HttpErrorResponse({ status: 0 }), translate).form_error,
    ).toBe(generic);
    expect(map_credentials_api_error(new Error('boom'), translate).form_error).toBe(generic);
  });
});
