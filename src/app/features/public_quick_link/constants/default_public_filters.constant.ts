import { IPublicGamesFilters } from '../models/public_games_filters.model';

/** No search and no facet chosen. */
export const DEFAULT_PUBLIC_FILTERS: Readonly<IPublicGamesFilters> = {
  search: '',
  level: null,
  league: null,
  location_group: null,
};
