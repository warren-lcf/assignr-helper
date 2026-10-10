import { HttpErrorResponse } from '@angular/common/http';
import { GamesErrorKind } from '../../games/enums/games_error_kind.enum';
import { map_schedule_load_error } from './map_schedule_load_error';

const translate = (key: string): string => `T(${key})`;

function api_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: 'Server English', violations: [] },
  });
}

describe('map_schedule_load_error', () => {
  it('words a general failure as the schedule not loading', () => {
    expect(map_schedule_load_error(api_error(500, 'INTERNAL'), translate)).toEqual({
      kind: GamesErrorKind.GENERIC,
      headline: 'T(Your schedule could not be loaded)',
      description: 'T(Check your connection and try again.)',
    });
  });

  it('treats a rejected query the same, since the fixed query should never cause it', () => {
    const mapped = map_schedule_load_error(api_error(400, 'VALIDATION_ERROR'), translate);

    expect(mapped.kind).toBe(GamesErrorKind.GENERIC);
    expect(mapped.headline).toBe('T(Your schedule could not be loaded)');
  });

  it('keeps the games wording for a missing tenant and a refused role', () => {
    expect(map_schedule_load_error(api_error(400, 'TENANT_REQUIRED'), translate).kind).toBe(
      GamesErrorKind.TENANT_REQUIRED,
    );
    const refused = map_schedule_load_error(api_error(403, 'PERMISSION_REQUIRED'), translate);
    expect(refused.kind).toBe(GamesErrorKind.PERMISSION_REQUIRED);
    expect(refused.headline).toBe('T(You do not have access to games)');
  });
});
