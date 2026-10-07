import { describe, expect, it } from 'vitest';
import { MergeOutcome } from './enums/merge_outcome.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { fingerprint_game } from './fingerprint_game.js';
import { make_normalized_game } from './make_normalized_game.fixture.js';
import { merge_stored_game } from './merge_stored_game.js';
import { IMergeGameInput } from './models/merge_game_input.model.js';
import { INormalizedGame } from '../integrations/models/normalized_game.model.js';

function make_input(
  kind: SyncKind,
  game: INormalizedGame = make_normalized_game(),
  overrides: Partial<IMergeGameInput> = {},
): IMergeGameInput {
  return {
    kind,
    game,
    tenant_id: 't1',
    connection_id: 'c1',
    organization_id: 'o1',
    venue_id: 'v1',
    local_date: Date.UTC(2026, 9, 11),
    fingerprint: fingerprint_game(game),
    run_id: 'run-1',
    new_game_id: 'g-new',
    actor: 'system:sync',
    now: 1000,
    ...overrides,
  };
}

describe('merge_stored_game', () => {
  it('creates an open game from an open-games run', () => {
    const result = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES));

    expect(result.outcome).toBe(MergeOutcome.CREATED);
    expect(result.game).toMatchObject({
      game_id: 'g-new',
      tenant_id: 't1',
      is_open: true,
      is_mine: false,
      removed_at: null,
      last_seen_sync_run_id: 'run-1',
      created_at: 1000,
      created_by: 'system:sync',
      updated_at: 1000,
      updated_by: 'system:sync',
      local_date: Date.UTC(2026, 9, 11),
    });
    expect(result.game.slots).toEqual([
      expect.objectContaining({ slot_id: 'slot_0', position: 'Referee' }),
    ]);
  });

  it('creates my game from a my-games run and never marks it open', () => {
    const game = make_normalized_game({ is_open: false, is_mine: true });

    const result = merge_stored_game(null, make_input(SyncKind.MY_GAMES, game));

    expect(result.game).toMatchObject({ is_open: false, is_mine: true, removed_at: null });
  });

  it('stamps removed_at when a new game is neither open nor mine', () => {
    const game = make_normalized_game({ is_open: false });

    const result = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES, game));

    expect(result.game.removed_at).toBe(1000);
  });

  it('reports unchanged for identical content and only refreshes last seen', () => {
    const first = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES)).game;

    const result = merge_stored_game(
      first,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game(), { run_id: 'run-2', now: 5000 }),
    );

    expect(result.outcome).toBe(MergeOutcome.UNCHANGED);
    expect(result.game.last_seen_sync_run_id).toBe('run-2');
    expect(result.game.updated_at).toBe(1000);
  });

  it('reports updated and stamps the audit fields when content changes', () => {
    const first = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES)).game;
    const moved = make_normalized_game({ home_team: 'Eagles' });

    const result = merge_stored_game(
      first,
      make_input(SyncKind.OPEN_GAMES, moved, { run_id: 'run-2', now: 5000, actor: 'user-9' }),
    );

    expect(result.outcome).toBe(MergeOutcome.UPDATED);
    expect(result.game).toMatchObject({
      home_team: 'Eagles',
      created_at: 1000,
      created_by: 'system:sync',
      updated_at: 5000,
      updated_by: 'user-9',
      game_id: first.game_id,
    });
  });

  it('keeps an existing game id and open flag when a my-games run sees it', () => {
    const first = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES)).game;
    const mine = make_normalized_game({ is_open: false, is_mine: true });

    const result = merge_stored_game(
      first,
      make_input(SyncKind.MY_GAMES, mine, { run_id: 'run-2', now: 5000 }),
    );

    expect(result.outcome).toBe(MergeOutcome.UPDATED);
    expect(result.game).toMatchObject({ game_id: first.game_id, is_open: true, is_mine: true });
    expect(result.game.removed_at).toBeNull();
  });

  it('does not clear is_mine when an open-games run sees the game without my slot', () => {
    const mine = merge_stored_game(
      null,
      make_input(SyncKind.MY_GAMES, make_normalized_game({ is_open: false, is_mine: true })),
    ).game;

    const result = merge_stored_game(
      mine,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game({ is_open: true }), {
        run_id: 'run-2',
        now: 5000,
      }),
    );

    expect(result.game).toMatchObject({ is_mine: true, is_open: true });
  });

  it('clears removed_at when a removed game reappears', () => {
    const removed = merge_stored_game(
      null,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game({ is_open: false })),
    ).game;
    expect(removed.removed_at).toBe(1000);

    const back = merge_stored_game(
      removed,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game({ is_open: true }), {
        run_id: 'run-2',
        now: 5000,
      }),
    );

    expect(back.outcome).toBe(MergeOutcome.UPDATED);
    expect(back.game.removed_at).toBeNull();
  });

  it('keeps the original removed_at while a game stays removed', () => {
    const removed = merge_stored_game(
      null,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game({ is_open: false })),
    ).game;

    const again = merge_stored_game(
      removed,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game({ is_open: false }), {
        run_id: 'run-2',
        now: 9000,
      }),
    );

    expect(again.outcome).toBe(MergeOutcome.UNCHANGED);
    expect(again.game.removed_at).toBe(1000);
  });

  it.each([
    ['organization', { organization_id: 'o2' }],
    ['venue', { venue_id: 'v2' }],
    ['local date', { local_date: Date.UTC(2026, 9, 12) }],
  ])('reports updated when only the %s mapping changes', (_label, overrides) => {
    const first = merge_stored_game(null, make_input(SyncKind.OPEN_GAMES)).game;

    const result = merge_stored_game(
      first,
      make_input(SyncKind.OPEN_GAMES, make_normalized_game(), { ...overrides, now: 5000 }),
    );

    expect(result.outcome).toBe(MergeOutcome.UPDATED);
  });
});
