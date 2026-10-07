import { HttpErrorResponse } from '@angular/common/http';
import { is_tenant_required } from './is_tenant_required';

function http_error(code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 400, error: { code, message: 'x', violations: [] } });
}

describe('is_tenant_required', () => {
  it('recognises a missing tenant on the HTTP error itself', () => {
    expect(is_tenant_required(http_error('TENANT_REQUIRED'))).toBe(true);
  });

  it('recognises it on the cause of a wrapped resource error', () => {
    expect(is_tenant_required({ cause: http_error('TENANT_REQUIRED') })).toBe(true);
  });

  it('is false for other codes and other errors', () => {
    expect(is_tenant_required(http_error('NOT_FOUND'))).toBe(false);
    expect(is_tenant_required(new Error('boom'))).toBe(false);
    expect(is_tenant_required(undefined)).toBe(false);
  });
});
