import { IGameGroupLocation } from '../../domain/games/game_group_location.model.js';
import { IGameView } from '../../domain/games/game_view.model.js';

/** The open games a draft lists right now. */
export interface ILoadedDigestGames {
  /** The games grouped by location, then date, then time, as the email lists them. */
  groups: IGameGroupLocation<IGameView>[];
  /** The same games in kick-off order. */
  games: IGameView[];
  /** Games that matched before the per-email cap. */
  total: number;
  /** True when more matched than one email lists, so only the soonest are shown. */
  truncated: boolean;
  /** IANA zone the email shows times in; null renders in UTC. */
  time_zone: string | null;
}
