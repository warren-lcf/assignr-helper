import { IGamesFacetOptions } from '../models/games_facet_options.model';
import { IGamesFilters } from '../models/games_filters.model';
import { IGamesResult } from '../models/games_result.model';

/** Collects distinct values (compared ignoring case, first spelling wins), sorted for people ("U9" before "U10"). */
function distinct_sorted(values: readonly (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Adds the user's current selection if the options do not list it, so the select can still show it. */
function with_selection(options: string[], selected: string | null): string[] {
  if (!selected || options.some((option) => option.toLowerCase() === selected.toLowerCase())) {
    return options;
  }
  return [...options, selected];
}

/**
 * Builds the facet select options from the games a facet-free request returned.
 * Locations keep the backend's order (A to Z, unknown last); the others are sorted.
 * A selected value that the result no longer offers stays in its list so the select still shows it.
 * @param result The facet-free result, or undefined while it loads.
 * @param filters The current selection.
 * @returns The options per facet.
 */
export function derive_facet_options(
  result: IGamesResult | undefined,
  filters: IGamesFilters,
): IGamesFacetOptions {
  const leagues: (string | null)[] = [];
  const levels: (string | null)[] = [];
  const age_groups: (string | null)[] = [];
  const locations: string[] = [];
  for (const location of result?.locations ?? []) {
    if (location.location_label && !locations.includes(location.location_label)) {
      locations.push(location.location_label);
    }
    for (const date of location.dates) {
      for (const game of date.games) {
        leagues.push(game.league);
        levels.push(game.level);
        age_groups.push(game.age_group);
      }
    }
  }
  return {
    league: with_selection(distinct_sorted(leagues), filters.league),
    level: with_selection(distinct_sorted(levels), filters.level),
    age_group: with_selection(distinct_sorted(age_groups), filters.age_group),
    location_group: with_selection(locations, filters.location_group),
  };
}
