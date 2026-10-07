import { IStoredGame } from '../../sync/models/stored_game.model.js';
import { IStoredOrganization } from '../../sync/models/stored_organization.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { IGameView } from './game_view.model.js';

/**
 * Projects a stored game to the games-list view. A position is open while no assignment is
 * recorded for it. Fees are not normalized in our data yet, so `fee_minor` and `currency`
 * are always null.
 * @param game Stored game with its slots.
 * @param venue The game's venue, or null when it has none or it is unknown.
 * @param organization The game's organization, or null when unknown (its name becomes empty).
 * @returns The view; nothing of the raw provider payload or assignee names is included.
 */
export function to_game_view(
  game: IStoredGame,
  venue: IStoredVenue | null,
  organization: IStoredOrganization | null,
): IGameView {
  const my_slot = game.slots.find((slot) => slot.is_mine);
  return {
    game_id: game.game_id,
    connection_id: game.connection_id,
    organization_id: game.organization_id,
    organization_name: organization?.name ?? '',
    venue_name: venue?.name ?? null,
    location_group: venue?.location_group ?? null,
    local_date: game.local_date,
    start_at: game.start_at,
    end_at: game.end_at,
    status: game.status,
    level: game.level,
    league: game.league,
    age_group: game.age_group,
    game_type: game.game_type,
    gender: game.gender,
    home_team: game.home_team,
    away_team: game.away_team,
    is_open: game.is_open,
    is_mine: game.is_mine,
    open_slot_count: game.slots.filter((slot) => slot.assignment_external_id === null).length,
    total_slot_count: game.slots.length,
    my_position: my_slot?.position ?? null,
    fee_minor: null,
    currency: null,
  };
}
