import { HttpErrorResponse } from '@angular/common/http';
import { GamesErrorKind } from '../enums/games_error_kind.enum';
import { make_translation_service_double } from '../mocks/translation_service.mock';
import { map_games_api_error } from './map_games_api_error';

const translate = make_translation_service_double().translate;

function api_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: 'English from server', violations: [] },
  });
}

describe('map_games_api_error', () => {
  it('asks a platform administrator to choose a tenant', () => {
    expect(map_games_api_error(api_error(400, 'TENANT_REQUIRED'), translate)).toEqual({
      kind: GamesErrorKind.TENANT_REQUIRED,
      headline: 'Choose a tenant first',
      description: 'Pick the tenant to act in from the header, then try again.',
    });
  });

  it('explains refused filters and how to fix them', () => {
    const mapped = map_games_api_error(api_error(400, 'VALIDATION_ERROR'), translate);

    expect(mapped.kind).toBe(GamesErrorKind.INVALID_FILTERS);
    expect(mapped.headline).toBe('Those filters cannot be used');
    expect(mapped.description).toBe('Clear the filters and try again.');
  });

  it('explains a refused role', () => {
    const mapped = map_games_api_error(api_error(403, 'PERMISSION_REQUIRED'), translate);

    expect(mapped.kind).toBe(GamesErrorKind.PERMISSION_REQUIRED);
    expect(mapped.headline).toBe('You do not have access to games');
  });

  it('falls back to a generic message and never shows the server wording', () => {
    for (const error of [
      api_error(500, 'INTERNAL'),
      new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }),
      new Error('boom'),
      undefined,
    ]) {
      const mapped = map_games_api_error(error, translate);

      expect(mapped.kind).toBe(GamesErrorKind.GENERIC);
      expect(mapped.headline).toBe('Games could not be loaded');
      expect(mapped.description).not.toContain('English from server');
    }
  });

  it('reads the API body from the HTTP error a resource wrapped', () => {
    const wrapped = new Error('Resource failed', { cause: api_error(400, 'VALIDATION_ERROR') });

    expect(map_games_api_error(wrapped, translate).kind).toBe(GamesErrorKind.INVALID_FILTERS);
  });
});
