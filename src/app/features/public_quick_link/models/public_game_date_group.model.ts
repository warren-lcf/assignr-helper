import { IPublicGame } from './public_game.model';

/** The games of one calendar date at one location, in start-time order. */
export interface IPublicGameDateGroup {
  /** The date, UTC-midnight milliseconds; null for games whose date is not known yet. */
  local_date: number | null;
  /** The date's games. */
  games: IPublicGame[];
}
