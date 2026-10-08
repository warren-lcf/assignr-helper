import { IStoredGame } from '../../sync/models/stored_game.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { IQuickLinkGameSource } from './quick_link_game_source.model.js';

/**
 * Projects a stored game to the internal source shape that `to_public_games` reduces.
 * Nothing private is carried further than needed: assignee names and the raw payload
 * are left empty, and the organization name is not looked up, because a public link
 * never shows them.
 * @param game Stored game with its slots.
 * @param venue The game's venue, or null when it has none or it is unknown.
 * @returns The source game; a position counts as open while no assignment is recorded for it.
 */
export function to_quick_link_game_source(
  game: IStoredGame,
  venue: IStoredVenue | null,
): IQuickLinkGameSource {
  return {
    game_id: game.game_id,
    external_id: game.external_id,
    organization_id: game.organization_id,
    organization_name: '',
    status: game.status,
    is_open: game.is_open,
    start_at: game.start_at,
    local_date: game.local_date,
    venue_name: venue?.name ?? null,
    location_group: venue?.location_group ?? null,
    level: game.level,
    league: game.league,
    home_team: game.home_team,
    away_team: game.away_team,
    open_slot_count: game.slots.filter((slot) => slot.assignment_external_id === null).length,
    slots: game.slots.map((slot) => ({
      position: slot.position.trim(),
      is_open: slot.assignment_external_id === null,
    })),
    fee_minor: null,
    currency: null,
    assignee_names: [],
    raw_json: null,
  };
}
