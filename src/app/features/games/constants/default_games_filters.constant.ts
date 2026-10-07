import { GamesScope } from '../enums/games_scope.enum';
import { IGamesFilters } from '../models/games_filters.model';

/** The filters the screen starts with, and "Clear filters" returns to (scope is kept). */
export const DEFAULT_GAMES_FILTERS: Readonly<IGamesFilters> = {
  scope: GamesScope.OPEN,
  search: '',
  league: null,
  level: null,
  age_group: null,
  location_group: null,
  only_with_open_slots: false,
  include_cancelled: false,
};
