import { PUBLIC_SEARCH_MAX_LENGTH } from '../constants/public_quick_link.constant';
import { IPublicGamesFilters } from '../models/public_games_filters.model';
import { IPublicGamesQuery } from '../models/public_games_query.model';

/**
 * Turns what the visitor chose into the call's query: search text is trimmed
 * and capped, and anything blank or unset is left out.
 * @param filters The chosen filters.
 * @returns The query to send.
 */
export function build_public_games_query(filters: IPublicGamesFilters): IPublicGamesQuery {
  const search = filters.search.trim().slice(0, PUBLIC_SEARCH_MAX_LENGTH).trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.league ? { league: filters.league } : {}),
    ...(filters.location_group ? { location_group: filters.location_group } : {}),
  };
}
