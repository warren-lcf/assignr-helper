import { PublicFilterKey } from '../enums/public_filter_key.enum';
import { IPublicGamesFilters } from '../models/public_games_filters.model';

/**
 * Sets one facet filter.
 * @param filters The chosen filters.
 * @param key Which filter to set.
 * @param value The new value; a blank one means "any".
 * @returns The updated filters.
 */
export function set_public_filter(
  filters: IPublicGamesFilters,
  key: PublicFilterKey,
  value: string | null,
): IPublicGamesFilters {
  const facet = value || null;
  switch (key) {
    case PublicFilterKey.LEVEL:
      return { ...filters, level: facet };
    case PublicFilterKey.LEAGUE:
      return { ...filters, league: facet };
    case PublicFilterKey.LOCATION_GROUP:
      return { ...filters, location_group: facet };
    default:
      return filters;
  }
}

/**
 * Switches one facet off, as removing its chip does.
 * @param filters The chosen filters.
 * @param key The chip key; an unknown key changes nothing.
 * @returns The filters without it.
 */
export function remove_public_filter(
  filters: IPublicGamesFilters,
  key: string,
): IPublicGamesFilters {
  const known = Object.values(PublicFilterKey).find((candidate) => candidate === key);
  return known ? set_public_filter(filters, known, null) : filters;
}
