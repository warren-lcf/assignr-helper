import { IGameGroupDate } from './game_group_date.model.js';

/** All games at one location, bucketed by date. */
export interface IGameGroupLocation {
  location_label: string;
  /** Dates ascending; an unknown date sorts last. */
  dates: IGameGroupDate[];
}
