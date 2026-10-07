import { HttpErrorResponse } from '@angular/common/http';
import { parse_api_error } from './parse_api_error';

function failure(body: unknown, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('parse_api_error', () => {
  it('reads code, message and violations from the API body', () => {
    const parsed = parse_api_error(
      failure({
        code: 'VALIDATION_ERROR',
        message: 'The request is not valid',
        violations: [{ path: 'client_id', message: 'Required' }],
      }),
    );

    expect(parsed).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'The request is not valid',
      violations: [{ path: 'client_id', message: 'Required' }],
    });
  });

  it('defaults a missing message and violations', () => {
    expect(parse_api_error(failure({ code: 'NOT_FOUND' }, 404))).toEqual({
      code: 'NOT_FOUND',
      message: '',
      violations: [],
    });
  });

  it('drops malformed violations', () => {
    const parsed = parse_api_error(
      failure({
        code: 'VALIDATION_ERROR',
        violations: [{ path: 'a' }, 'x', null, { path: 'b', message: 'bad' }],
      }),
    );

    expect(parsed?.violations).toEqual([{ path: 'b', message: 'bad' }]);
  });

  it('returns null for a failure without an API body', () => {
    expect(parse_api_error(failure('<html>bad gateway</html>', 502))).toBeNull();
    expect(parse_api_error(failure(null, 0))).toBeNull();
    expect(parse_api_error(failure({ message: 'no code' }))).toBeNull();
    expect(parse_api_error(new Error('boom'))).toBeNull();
    expect(parse_api_error(undefined)).toBeNull();
  });
});
