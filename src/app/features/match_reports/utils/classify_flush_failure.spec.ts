import { HttpErrorResponse } from '@angular/common/http';
import { FlushFailure } from '../enums/flush_failure.enum';
import { classify_flush_failure } from './classify_flush_failure';

describe('classify_flush_failure', () => {
  it.each([0, 500, 502, 503, 504, 408, 429])(
    'keeps the edit and retries on status %i',
    (status) => {
      expect(classify_flush_failure(new HttpErrorResponse({ status }))).toBe(FlushFailure.RETRY);
    },
  );

  it.each([400, 401, 403, 404, 409, 413, 422])('drops the edit on status %i', (status) => {
    expect(classify_flush_failure(new HttpErrorResponse({ status }))).toBe(FlushFailure.DROP);
  });

  it('retries a 409 REPORT_CONFLICT (the server lost its compare-and-swap) like a server error', () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { code: 'REPORT_CONFLICT', message: 'x', violations: [] },
    });

    expect(classify_flush_failure(conflict)).toBe(FlushFailure.RETRY);
  });

  it.each([
    'REPORT_NOT_EDITABLE',
    'TOO_MANY_INCIDENTS',
    'GAME_CANCELLED',
    'IDEMPOTENCY_KEY_CONFLICT',
  ])('still drops a 409 %s, which retrying cannot fix', (code) => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { code, message: 'x', violations: [] },
    });

    expect(classify_flush_failure(refusal)).toBe(FlushFailure.DROP);
  });

  it('drops an error that is not an HTTP answer, rather than retrying a bug forever', () => {
    expect(classify_flush_failure(new TypeError('x is not a function'))).toBe(FlushFailure.DROP);
    expect(classify_flush_failure(undefined)).toBe(FlushFailure.DROP);
  });
});
