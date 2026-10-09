import { IPublicAgendaRow } from '../models/public_agenda_row.model';
import { IPublicLocationGroup } from '../models/public_location_group.model';

/**
 * Lays the location groups out as one flat list of rows in the order the server sent them
 * (location, then date, then start time), each remembering its group, so the agenda list can group
 * them again without reordering anything.
 * @param locations The grouped games as the server returned them.
 * @returns Every game as a row, in display order. The input is not changed.
 */
export function flatten_public_games(
  locations: readonly IPublicLocationGroup[],
): IPublicAgendaRow[] {
  return locations.flatMap((location) =>
    location.dates.flatMap((date) =>
      date.games.map((game): IPublicAgendaRow => ({
        game,
        location_label: location.location_label,
        local_date: date.local_date,
      })),
    ),
  );
}
