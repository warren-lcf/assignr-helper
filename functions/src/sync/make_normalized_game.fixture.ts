import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { INormalizedGame } from '../integrations/models/normalized_game.model.js';

/**
 * Builds a normalized game for specs, with sensible defaults.
 * @param overrides Fields to replace.
 * @returns A complete normalized game.
 */
export function make_normalized_game(overrides: Partial<INormalizedGame> = {}): INormalizedGame {
  return {
    external_id: '5001',
    organization_external_id: '101',
    venue: {
      external_id: '77',
      name: 'Riverside Park Field 3',
      address_line: null,
      city: null,
      region: null,
      postal_code: null,
      latitude: null,
      longitude: null,
      time_zone: 'America/New_York',
    },
    start_at: Date.UTC(2026, 9, 11, 13, 0, 0),
    end_at: Date.UTC(2026, 9, 11, 14, 15, 0),
    game_time_zone: 'America/New_York',
    status: GameStatus.SCHEDULED,
    published: true,
    league: 'Fall Recreational',
    age_group: 'U12',
    level: null,
    game_type: 'League',
    gender: 'Boys',
    home_team: 'Hawks',
    away_team: 'Falcons',
    is_open: true,
    is_mine: false,
    slots: [
      {
        position: 'Referee',
        assignee_name: null,
        assignment_external_id: null,
        response_status: AssignmentResponseStatus.UNRESPONDED,
        is_mine: false,
        lock_version: null,
        fees: [],
      },
    ],
    external_updated_at: Date.UTC(2026, 9, 5, 18, 30, 0),
    lock_version: 1,
    raw: { id: 5001 },
    ...overrides,
  };
}
