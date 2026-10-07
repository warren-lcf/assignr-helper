import { GAMES_SEARCH_MAX_LENGTH } from '../constants/games_limits.constant';
import { IGamesFilters } from '../models/games_filters.model';
import { IGamesQuery } from '../models/games_query.model';

/**
 * Turns what the user chose into the backend's query: text is trimmed and
 * capped at the backend's limit, and anything blank or unset is left out
 * (the backend is strict about parameters, and blank search is ignored anyway).
 * @param filters The chosen filters.
 * @returns The query to send.
 */
export function build_games_query(filters: IGamesFilters): IGamesQuery {
  const search = filters.search.trim().slice(0, GAMES_SEARCH_MAX_LENGTH).trim();
  return {
    scope: filters.scope,
    ...(search ? { search } : {}),
    ...(filters.league ? { league: filters.league } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.age_group ? { age_group: filters.age_group } : {}),
    ...(filters.location_group ? { location_group: filters.location_group } : {}),
    only_with_open_slots: filters.only_with_open_slots,
    include_cancelled: filters.include_cancelled,
  };
}

/**
 * The query without the four facet selections: the request whose answer
 * lists every facet value still worth offering for the current scope, search
 * and toggles.
 * @param filters The chosen filters.
 * @returns The query to send for facet options.
 */
export function build_facet_source_query(filters: IGamesFilters): IGamesQuery {
  return build_games_query({
    ...filters,
    league: null,
    level: null,
    age_group: null,
    location_group: null,
  });
}

/**
 * Whether any facet (league, level, age group, location) is selected.
 * @param filters The chosen filters.
 * @returns True when at least one facet narrows the list.
 */
export function has_facet_selection(filters: IGamesFilters): boolean {
  return Boolean(filters.league || filters.level || filters.age_group || filters.location_group);
}
