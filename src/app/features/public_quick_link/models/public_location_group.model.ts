import { IPublicGameDateGroup } from './public_game_date_group.model';

/** All games at one location, bucketed by date. */
export interface IPublicLocationGroup {
  /** The location's name, or the server's placeholder when it is not known. */
  location_label: string;
  /** Dates ascending; an unknown date sorts last. */
  dates: IPublicGameDateGroup[];
}
