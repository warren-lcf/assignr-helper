import { SyncKind } from './enums/sync_kind.enum.js';
import { MergeOutcome } from './enums/merge_outcome.enum.js';
import { IMergeGameInput } from './models/merge_game_input.model.js';
import { IMergeResult } from './models/merge_result.model.js';
import { IStoredGame } from './models/stored_game.model.js';
import { IStoredGameSlot } from './models/stored_game_slot.model.js';

/**
 * Merges an incoming game into the stored copy (or creates it).
 *
 * Flag rules: an open-games list owns `is_open`; the account's own list owns
 * `is_mine` and never clears `is_open`. A game that is neither open nor mine is
 * stamped `removed_at`; it is kept, never deleted. A game seen again with no
 * content change only refreshes `last_seen_sync_run_id`, leaving the audit
 * fields alone.
 * @param existing The stored game, or null when new.
 * @param input Incoming game and merge context.
 * @returns The game to persist and how it compared with what was stored.
 */
export function merge_stored_game(
  existing: IStoredGame | null,
  input: IMergeGameInput,
): IMergeResult {
  const is_open =
    input.kind === SyncKind.OPEN_GAMES ? input.game.is_open : (existing?.is_open ?? false);
  const is_mine =
    input.kind === SyncKind.MY_GAMES ? true : (existing?.is_mine ?? false) || input.game.is_mine;
  const removed_at = !is_open && !is_mine ? (existing?.removed_at ?? input.now) : null;

  const slots: IStoredGameSlot[] = input.game.slots.map((slot, index) => ({
    slot_id: `slot_${index}`,
    ...slot,
  }));

  const content: Omit<IStoredGame, 'created_at' | 'created_by' | 'updated_at' | 'updated_by'> = {
    tenant_id: input.tenant_id,
    game_id: existing?.game_id ?? input.new_game_id,
    connection_id: input.connection_id,
    organization_id: input.organization_id,
    external_id: input.game.external_id,
    venue_id: input.venue_id,
    start_at: input.game.start_at,
    end_at: input.game.end_at,
    game_time_zone: input.game.game_time_zone,
    local_date: input.local_date,
    status: input.game.status,
    published: input.game.published,
    league: input.game.league,
    age_group: input.game.age_group,
    level: input.game.level,
    game_type: input.game.game_type,
    gender: input.game.gender,
    home_team: input.game.home_team,
    away_team: input.game.away_team,
    is_open,
    is_mine,
    external_updated_at: input.game.external_updated_at,
    lock_version: input.game.lock_version,
    fingerprint: input.fingerprint,
    last_seen_sync_run_id: input.run_id,
    removed_at,
    raw: input.game.raw,
    slots,
  };

  if (!existing) {
    return {
      outcome: MergeOutcome.CREATED,
      game: {
        ...content,
        created_at: input.now,
        created_by: input.actor,
        updated_at: input.now,
        updated_by: input.actor,
      },
    };
  }

  const changed =
    existing.fingerprint !== input.fingerprint ||
    existing.is_open !== is_open ||
    existing.is_mine !== is_mine ||
    (existing.removed_at === null) !== (removed_at === null) ||
    existing.organization_id !== input.organization_id ||
    existing.venue_id !== input.venue_id ||
    existing.local_date !== input.local_date;

  if (!changed) {
    return {
      outcome: MergeOutcome.UNCHANGED,
      game: { ...existing, last_seen_sync_run_id: input.run_id },
    };
  }

  return {
    outcome: MergeOutcome.UPDATED,
    game: {
      ...content,
      created_at: existing.created_at,
      created_by: existing.created_by,
      updated_at: input.now,
      updated_by: input.actor,
    },
  };
}
