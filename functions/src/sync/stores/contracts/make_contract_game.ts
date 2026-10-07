import { AssignmentResponseStatus } from '../../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../../integrations/enums/game_status.enum.js';
import { IStoredGame } from '../../models/stored_game.model.js';

/**
 * Builds a fully populated stored game for contract tests. The provider id derives from
 * `game_id` so several games in one tenant never collide on the unique external id index.
 * @param tenant_id Owning tenant.
 * @param game_id Primary key of the game.
 * @param overrides Fields to replace.
 * @returns A complete game with one slot.
 */
export function make_contract_game(
  tenant_id: string,
  game_id: string,
  overrides: Partial<IStoredGame> = {},
): IStoredGame {
  return {
    tenant_id,
    game_id,
    connection_id: 'c1',
    organization_id: 'org-1',
    external_id: `ext-${game_id}`,
    venue_id: null,
    start_at: 1000,
    end_at: null,
    game_time_zone: null,
    local_date: null,
    status: GameStatus.SCHEDULED,
    published: true,
    league: null,
    age_group: null,
    level: null,
    game_type: null,
    gender: null,
    home_team: null,
    away_team: null,
    is_open: true,
    is_mine: false,
    external_updated_at: null,
    lock_version: null,
    fingerprint: 'fp',
    last_seen_sync_run_id: 'old-run',
    removed_at: null,
    raw: { a: 1 },
    slots: [
      {
        slot_id: 'slot_1',
        position: 'Referee',
        assignee_name: null,
        assignment_external_id: null,
        response_status: AssignmentResponseStatus.UNRESPONDED,
        is_mine: false,
        lock_version: null,
        fees: [{ amount: 1 }],
      },
    ],
    created_at: 1,
    created_by: 'a',
    updated_at: 1,
    updated_by: 'a',
    ...overrides,
  };
}
