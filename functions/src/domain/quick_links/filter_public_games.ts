import { resolve_location_label } from '../games/resolve_location_label.js';
import { IPublicGame } from './public_game.model.js';
import { IPublicGameFilters } from './public_game_filters.model.js';

/**
 * Compares an optional text with a wanted text, ignoring case and surrounding whitespace.
 * @param value Text on the game, possibly null.
 * @param wanted Text asked for.
 * @returns True when both are the same text apart from case.
 */
function equals_ignoring_case(value: string | null, wanted: string): boolean {
  return value !== null && value.trim().toLowerCase() === wanted.trim().toLowerCase();
}

/**
 * Tests whether a public game's searchable text contains the needle.
 * @param game The public game.
 * @param needle Lower-cased, trimmed, non-empty search text.
 * @returns True when any searchable field contains the needle, ignoring case.
 */
function matches_search(game: IPublicGame, needle: string): boolean {
  return [
    game.home_team,
    game.away_team,
    game.league,
    game.level,
    game.venue_name,
    game.location_group,
  ].some((text) => text !== null && text.toLowerCase().includes(needle));
}

/**
 * Narrows public games with the same rules as the signed-in games list: exact
 * case-insensitive level, league and location filters, and a case-insensitive
 * text search. The search covers only fields a public game carries (organization
 * and age group are not part of the public shape, so they are not searchable). The
 * input is not mutated and its order is kept.
 * @param games Public games to narrow.
 * @param filters Filters to apply; null or blank values are off.
 * @returns The matching games.
 */
export function filter_public_games(
  games: IPublicGame[],
  filters: IPublicGameFilters,
): IPublicGame[] {
  const needle = filters.search?.trim().toLowerCase() ?? '';
  return games.filter((game) => {
    if (filters.level !== null && !equals_ignoring_case(game.level, filters.level)) {
      return false;
    }
    if (filters.league !== null && !equals_ignoring_case(game.league, filters.league)) {
      return false;
    }
    if (
      filters.location_group !== null &&
      !equals_ignoring_case(
        resolve_location_label(game.location_group, game.venue_name),
        filters.location_group,
      )
    ) {
      return false;
    }
    return needle === '' || matches_search(game, needle);
  });
}
