import { IGameDateGroup } from './game_date_group.model';

/** The games at one location, by date. */
export interface IGameLocationGroup {
  /** Resolved location label, including the placeholder for unknown locations. */
  location_label: string;
  dates: IGameDateGroup[];
}
