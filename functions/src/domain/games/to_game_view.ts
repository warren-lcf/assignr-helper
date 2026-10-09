import { IStoredGame } from '../../sync/models/stored_game.model.js';
import { IStoredOrganization } from '../../sync/models/stored_organization.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { GameSlotState } from './game_slot_state.enum.js';
import { IGameSlotView } from './game_slot_view.model.js';
import { valid_time_zone_or_null } from '../time/valid_time_zone_or_null.js';
import { IGameView } from './game_view.model.js';

/**
 * Decides how one position shows in the list: open while no assignment is recorded for it,
 * the account's own when it holds it, otherwise filled.
 * @param assignment_external_id The provider's assignment id, or null while unfilled.
 * @param is_mine True when the connected account holds the position.
 * @returns The slot state.
 */
function slot_state_of(assignment_external_id: string | null, is_mine: boolean): GameSlotState {
  if (assignment_external_id === null) return GameSlotState.OPEN;
  return is_mine ? GameSlotState.MINE : GameSlotState.FILLED;
}

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
  const slots = game.slots.map((slot): IGameSlotView => ({
    position: slot.position.trim(),
    state: slot_state_of(slot.assignment_external_id, slot.is_mine),
  }));
  return {
    game_id: game.game_id,
    connection_id: game.connection_id,
    organization_id: game.organization_id,
    organization_name: organization?.name ?? '',
    venue_name: venue?.name ?? null,
    location_group: venue?.location_group ?? null,
    local_date: game.local_date,
    time_zone:
      valid_time_zone_or_null(game.game_time_zone) ?? valid_time_zone_or_null(venue?.time_zone),
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
    open_slot_count: slots.filter((slot) => slot.state === GameSlotState.OPEN).length,
    open_positions: slots
      .filter((slot) => slot.state === GameSlotState.OPEN)
      .map((slot) => slot.position),
    slots,
    total_slot_count: game.slots.length,
    my_position: my_slot?.position ?? null,
    fee_minor: null,
    currency: null,
  };
}
