import { IGameGroupDate } from './game_group_date.model.js';
import { IGameListItem } from './game_list_item.model.js';

/** All games at one location, bucketed by date. */
export interface IGameGroupLocation<T extends IGameListItem = IGameListItem> {
  location_label: string;
  /** Dates ascending; an unknown date sorts last. */
  dates: IGameGroupDate<T>[];
}
