import { HttpErrorResponse } from '@angular/common/http';
import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { map_report_api_error } from './map_report_api_error';

const translate = (key: string): string => `T(${key})`;

function api_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: 'Server English', violations: [] },
  });
}

describe('map_report_api_error', () => {
  it('asks a platform administrator to choose a tenant', () => {
    expect(map_report_api_error(api_error(400, 'TENANT_REQUIRED'), translate)).toEqual({
      kind: ReportErrorKind.TENANT_REQUIRED,
      headline: 'T(Choose a tenant first)',
      description: 'T(Pick the tenant to act in from the header, then try again.)',
    });
  });

  it('says the role has no access', () => {
    const mapped = map_report_api_error(api_error(403, 'PERMISSION_REQUIRED'), translate);

    expect(mapped.kind).toBe(ReportErrorKind.PERMISSION_REQUIRED);
    expect(mapped.headline).toBe('T(You do not have access to match reports)');
  });

  it('says a cancelled game has no report', () => {
    const mapped = map_report_api_error(api_error(409, 'GAME_CANCELLED'), translate);

    expect(mapped.kind).toBe(ReportErrorKind.GAME_CANCELLED);
    expect(mapped.headline).toBe('T(This game was cancelled)');
    expect(mapped.description).toBe('T(A cancelled game has no match report.)');
  });

  it('says the game is not the referee’s', () => {
    const mapped = map_report_api_error(api_error(404, 'NOT_FOUND'), translate);

    expect(mapped.kind).toBe(ReportErrorKind.NOT_FOUND);
    expect(mapped.headline).toBe('T(This game is not one of yours)');
  });

  it('gives generic advice for anything else, and never shows the server’s wording', () => {
    const mapped = map_report_api_error(api_error(500, 'BOOM'), translate);

    expect(mapped).toEqual({
      kind: ReportErrorKind.GENERIC,
      headline: 'T(The match report could not be loaded)',
      description: 'T(Check your connection and try again.)',
    });
    expect(JSON.stringify(mapped)).not.toContain('Server English');
  });
});
