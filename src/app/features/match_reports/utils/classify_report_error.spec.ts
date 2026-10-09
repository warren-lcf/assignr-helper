import { HttpErrorResponse } from '@angular/common/http';
import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { classify_report_error } from './classify_report_error';

function api_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

describe('classify_report_error', () => {
  it.each([
    [403, 'PERMISSION_REQUIRED', ReportErrorKind.PERMISSION_REQUIRED],
    [400, 'TENANT_REQUIRED', ReportErrorKind.TENANT_REQUIRED],
    [409, 'GAME_CANCELLED', ReportErrorKind.GAME_CANCELLED],
    [404, 'NOT_FOUND', ReportErrorKind.NOT_FOUND],
    [500, 'SOMETHING_ELSE', ReportErrorKind.GENERIC],
  ])('sorts %i %s into %s and keeps the code', (status, code, kind) => {
    expect(classify_report_error(api_error(status, code))).toEqual({ kind, code });
  });

  it('reads the error from inside a resource error', () => {
    expect(classify_report_error({ cause: api_error(409, 'GAME_CANCELLED') })).toEqual({
      kind: ReportErrorKind.GAME_CANCELLED,
      code: 'GAME_CANCELLED',
    });
  });

  it('is generic, with no code, for a network failure or anything that is not an API answer', () => {
    expect(classify_report_error(new HttpErrorResponse({ status: 0 }))).toEqual({
      kind: ReportErrorKind.GENERIC,
      code: null,
    });
    expect(classify_report_error(new Error('boom'))).toEqual({
      kind: ReportErrorKind.GENERIC,
      code: null,
    });
  });
});
