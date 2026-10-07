import { IGameView } from './game_view.model';

/** The games on one calendar date, by start time. */
export interface IGameDateGroup {
  /** UTC-midnight milliseconds of the calendar date; null for games without one (listed last). */
  local_date: number | null;
  games: IGameView[];
}
