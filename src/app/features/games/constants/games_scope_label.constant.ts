import { GamesScope } from '../enums/games_scope.enum';

/** English label of each scope; translated where it is shown. */
export const GAMES_SCOPE_LABEL: Readonly<Record<GamesScope, string>> = {
  [GamesScope.OPEN]: 'Open games',
  [GamesScope.MINE]: 'My games',
  [GamesScope.ALL]: 'All games',
};
