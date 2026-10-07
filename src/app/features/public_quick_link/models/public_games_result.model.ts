import { IPublicLocationGroup } from './public_location_group.model';

/** What `GET /api/public/q/:token/games` returns. */
export interface IPublicGamesResult {
  /** When the server read the games, UTC milliseconds. */
  as_of: number;
  /** How many games matched the visitor's filters. */
  total: number;
  /** The games, grouped by location, then date. */
  locations: IPublicLocationGroup[];
  /** Level choices for the filter, among the link's visible games. */
  levels: string[];
  /** League choices for the filter. */
  leagues: string[];
  /** Location choices for the filter. */
  location_groups: string[];
}
