import { GamesErrorKind } from '../../games/enums/games_error_kind.enum';
import { IMappedGamesError } from '../../games/models/mapped_games_error.model';
import { map_games_api_error } from '../../games/utils/map_games_api_error';

/**
 * Turns a failed schedule load into the heading and advice the screen shows. It is the games call,
 * so the games wording applies, except that a general failure and a rejected query (which this
 * screen's fixed query should never cause) both say the schedule could not be loaded.
 * @param error Whatever the call (or the resource around it) threw.
 * @param translate Translates an English key.
 * @returns The kind of failure and its messages.
 */
export function map_schedule_load_error(
  error: unknown,
  translate: (key: string) => string,
): IMappedGamesError {
  const mapped = map_games_api_error(error, translate);
  if (mapped.kind === GamesErrorKind.GENERIC || mapped.kind === GamesErrorKind.INVALID_FILTERS) {
    return {
      kind: GamesErrorKind.GENERIC,
      headline: translate('Your schedule could not be loaded'),
      description: translate('Check your connection and try again.'),
    };
  }
  return mapped;
}
