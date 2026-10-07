import { resolve_location_label } from '../games/resolve_location_label.js';
import { UNKNOWN_LOCATION_LABEL } from '../games/unknown_location_label.constant.js';
import { IPublicGame } from './public_game.model.js';
import { IPublicGameOptions } from './public_game_options.model.js';

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/**
 * Collects distinct texts, treating texts that differ only by case or surrounding
 * whitespace as one (the first spelling seen wins), and sorts them A to Z.
 * @param values Texts that may be null or blank.
 * @param last_label A label to sort after all others, if any.
 * @returns Distinct texts in display order.
 */
function distinct_sorted(values: (string | null)[], last_label?: string): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim() ?? '';
    if (trimmed !== '' && !seen.has(trimmed.toLowerCase())) {
      seen.set(trimmed.toLowerCase(), trimmed);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const a_last = a === last_label;
    const b_last = b === last_label;
    if (a_last !== b_last) {
      return a_last ? 1 : -1;
    }
    const compared = collator.compare(a, b);
    if (compared !== 0) {
      return compared;
    }
    return a < b ? -1 : 1;
  });
}

/**
 * Lists the values a quick-link page can offer in its filter dropdowns, taken from
 * the games the link can show before any visitor filter is applied (so choosing one
 * option never hides the others).
 * @param games The link's visible games, unfiltered by facet.
 * @returns Distinct levels, leagues and location labels, each A to Z.
 */
export function list_public_game_options(games: IPublicGame[]): IPublicGameOptions {
  return {
    levels: distinct_sorted(games.map((game) => game.level)),
    leagues: distinct_sorted(games.map((game) => game.league)),
    location_groups: distinct_sorted(
      games.map((game) => resolve_location_label(game.location_group, game.venue_name)),
      UNKNOWN_LOCATION_LABEL,
    ),
  };
}
