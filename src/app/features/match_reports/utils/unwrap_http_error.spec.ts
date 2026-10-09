import { HttpErrorResponse } from '@angular/common/http';
import { unwrap_http_error } from './unwrap_http_error';

describe('unwrap_http_error', () => {
  const http_error = new HttpErrorResponse({ status: 500 });

  it('returns an HTTP error as it is', () => {
    expect(unwrap_http_error(http_error)).toBe(http_error);
  });

  it('digs the HTTP error out of a resource error', () => {
    expect(unwrap_http_error({ cause: http_error })).toBe(http_error);
  });

  it('returns anything else as it is', () => {
    const other = new Error('boom');

    expect(unwrap_http_error(other)).toBe(other);
    expect(unwrap_http_error({ cause: 'text' })).toEqual({ cause: 'text' });
    expect(unwrap_http_error(undefined)).toBeUndefined();
  });
});
