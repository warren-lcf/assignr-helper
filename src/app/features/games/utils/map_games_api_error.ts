import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorCode } from '../../connections/enums/api_error_code.enum';
import { parse_api_error } from '../../connections/services/parse_api_error';
import { GamesErrorKind } from '../enums/games_error_kind.enum';
import { IMappedGamesError } from '../models/mapped_games_error.model';

/** A resource wraps the error it was given; the API's error body lives on the original HTTP error. */
function unwrap_error(error: unknown): unknown {
  if (error instanceof HttpErrorResponse) return error;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof HttpErrorResponse ? cause : error;
}

/**
 * Turns a failed games call into the heading and advice the screen shows.
 * The server's English wording is never shown; every message is the app's own translated text.
 * @param error Whatever the call (or the resource around it) threw.
 * @param translate Translates an English key.
 * @returns The kind of failure and its messages.
 */
export function map_games_api_error(
  error: unknown,
  translate: (key: string) => string,
): IMappedGamesError {
  switch (parse_api_error(unwrap_error(error))?.code) {
    case ApiErrorCode.TENANT_REQUIRED:
      return {
        kind: GamesErrorKind.TENANT_REQUIRED,
        headline: translate('Choose a tenant first'),
        description: translate('Pick the tenant to act in from the header, then try again.'),
      };
    case ApiErrorCode.VALIDATION_ERROR:
      return {
        kind: GamesErrorKind.INVALID_FILTERS,
        headline: translate('Those filters cannot be used'),
        description: translate('Clear the filters and try again.'),
      };
    case ApiErrorCode.PERMISSION_REQUIRED:
      return {
        kind: GamesErrorKind.PERMISSION_REQUIRED,
        headline: translate('You do not have access to games'),
        description: translate('Ask a tenant owner to give your role access to games.'),
      };
    default:
      return {
        kind: GamesErrorKind.GENERIC,
        headline: translate('Games could not be loaded'),
        description: translate('Check your connection and try again.'),
      };
  }
}
