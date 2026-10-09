import { IGameLocationGroup } from '../models/game_location_group.model';
import { IGameView } from '../models/game_view.model';

/**
 * Lays the location groups out as one flat list of games in the order the server sent them
 * (location, then date, then start time), so the agenda list can group them again without
 * reordering anything.
 * @param locations The grouped games as the server returned them.
 * @returns Every game, in display order. The input is not changed.
 */
export function flatten_games_in_order(locations: readonly IGameLocationGroup[]): IGameView[] {
  return locations.flatMap((location) => location.dates.flatMap((date) => date.games));
}
