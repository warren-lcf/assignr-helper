import { IGameLocationGroup } from './game_location_group.model';

/** The payload of `GET /api/games`: locations A to Z (unknown last), each with dates ascending. */
export interface IGamesResult {
  locations: IGameLocationGroup[];
  /** Number of games matching the filters. */
  total: number;
  /** True when the list was cut off at the backend's cap. */
  truncated: boolean;
}
