import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IGameView } from './game_view.model.js';

/**
 * Builds a game view for specs.
 * @param overrides Fields to replace.
 * @returns A scheduled, open game with one open position and no optional text.
 */
export function make_game_view(overrides: Partial<IGameView> = {}): IGameView {
  return {
    game_id: 'g1',
    connection_id: 'c1',
    organization_id: 'org-1',
    organization_name: 'Metro Soccer',
    venue_name: null,
    location_group: null,
    local_date: Date.UTC(2026, 9, 10),
    start_at: Date.UTC(2026, 9, 10, 14),
    end_at: null,
    status: GameStatus.SCHEDULED,
    level: null,
    league: null,
    age_group: null,
    game_type: null,
    gender: null,
    home_team: null,
    away_team: null,
    is_open: true,
    is_mine: false,
    open_slot_count: 1,
    total_slot_count: 1,
    my_position: null,
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}
