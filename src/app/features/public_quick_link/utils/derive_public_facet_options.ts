import { IPublicFacetOptions } from '../models/public_facet_options.model';
import { IPublicGamesFilters } from '../models/public_games_filters.model';
import { IPublicGamesResult } from '../models/public_games_result.model';

/** Keeps a chosen value on offer even when the latest answer no longer lists it, so the select never shows blank. */
function with_selected(options: readonly string[], selected: string | null): string[] {
  return selected && !options.includes(selected) ? [selected, ...options] : [...options];
}

/**
 * The values each filter select offers, from the latest answer lists.
 * @param result The latest answer, or undefined before the first one.
 * @param filters The chosen filters.
 * @returns The options for each select.
 */
export function derive_public_facet_options(
  result: IPublicGamesResult | undefined,
  filters: IPublicGamesFilters,
): IPublicFacetOptions {
  return {
    level: with_selected(result?.levels ?? [], filters.level),
    league: with_selected(result?.leagues ?? [], filters.league),
    location_group: with_selected(result?.location_groups ?? [], filters.location_group),
  };
}
