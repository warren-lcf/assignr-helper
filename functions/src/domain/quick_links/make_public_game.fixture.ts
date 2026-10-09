import { IPublicGame } from './public_game.model.js';

/**
 * Builds a public game for specs.
 * @param overrides Fields to replace.
 * @returns A game with one open position and no optional text.
 */
export function make_public_game(overrides: Partial<IPublicGame> = {}): IPublicGame {
  return {
    game_id: 'g1',
    start_at: Date.UTC(2026, 9, 10, 14),
    local_date: Date.UTC(2026, 9, 10),
    time_zone: null,
    venue_name: null,
    location_group: null,
    level: null,
    league: null,
    home_team: null,
    away_team: null,
    open_slot_count: 1,
    slots: [{ position: 'Referee', is_open: true }],
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}
