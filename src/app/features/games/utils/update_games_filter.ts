import { GamesFilterKey } from '../enums/games_filter_key.enum';
import { IGamesFilters } from '../models/games_filters.model';

/**
 * Sets one filter. Facets take a string (a blank one means "any"), toggles take a boolean.
 * @param filters The chosen filters.
 * @param key Which filter to set.
 * @param value The new value; a value of the wrong kind for the key changes nothing.
 * @returns The updated filters.
 */
export function set_games_filter(
  filters: IGamesFilters,
  key: GamesFilterKey,
  value: string | boolean | null,
): IGamesFilters {
  if (typeof value === 'boolean') {
    switch (key) {
      case GamesFilterKey.ONLY_WITH_OPEN_SLOTS:
        return { ...filters, only_with_open_slots: value };
      case GamesFilterKey.INCLUDE_CANCELLED:
        return { ...filters, include_cancelled: value };
      default:
        return filters;
    }
  }
  const facet = value || null;
  switch (key) {
    case GamesFilterKey.LEAGUE:
      return { ...filters, league: facet };
    case GamesFilterKey.LEVEL:
      return { ...filters, level: facet };
    case GamesFilterKey.AGE_GROUP:
      return { ...filters, age_group: facet };
    case GamesFilterKey.LOCATION_GROUP:
      return { ...filters, location_group: facet };
    default:
      return filters;
  }
}

/**
 * Switches one filter off, as removing its chip does.
 * @param filters The chosen filters.
 * @param key The chip's key; an unknown key changes nothing.
 * @returns The filters without it.
 */
export function remove_games_filter(filters: IGamesFilters, key: string): IGamesFilters {
  const known = Object.values(GamesFilterKey).find((candidate) => candidate === key);
  if (!known) return filters;
  const is_toggle =
    known === GamesFilterKey.ONLY_WITH_OPEN_SLOTS || known === GamesFilterKey.INCLUDE_CANCELLED;
  return set_games_filter(filters, known, is_toggle ? false : null);
}
