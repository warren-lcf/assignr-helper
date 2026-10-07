import { GamesScope } from '../enums/games_scope.enum';

/** What the user has chosen on the Games screen. `null` means "any". */
export interface IGamesFilters {
  scope: GamesScope;
  search: string;
  league: string | null;
  level: string | null;
  age_group: string | null;
  location_group: string | null;
  only_with_open_slots: boolean;
  include_cancelled: boolean;
}
