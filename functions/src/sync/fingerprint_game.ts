import { createHash } from 'node:crypto';
import { INormalizedGame } from '../integrations/models/normalized_game.model.js';

/**
 * Hashes the content of a game that makes it "changed", in a fixed field order.
 * The raw payload and the endpoint-dependent flags (`is_open`, `is_mine`) are
 * left out: the first is noisy and the second is decided by which list the game
 * appeared on, not by the game itself.
 * @param game Normalized game.
 * @returns A 64-character SHA-256 hex digest.
 */
export function fingerprint_game(game: INormalizedGame): string {
  const content = [
    game.external_id,
    game.organization_external_id,
    game.venue,
    game.start_at,
    game.end_at,
    game.game_time_zone,
    game.status,
    game.published,
    game.league,
    game.age_group,
    game.level,
    game.game_type,
    game.gender,
    game.home_team,
    game.away_team,
    game.external_updated_at,
    game.lock_version,
    game.slots.map((slot) => [
      slot.position,
      slot.assignee_name,
      slot.assignment_external_id,
      slot.response_status,
      slot.is_mine,
      slot.lock_version,
      slot.fees,
    ]),
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
