import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { IStoredGame } from '../models/stored_game.model.js';
import { IUnseenGamesQuery } from '../models/unseen_games_query.model.js';
import { InMemoryGameStore } from './in_memory_game_store.js';

function make_stored_game(overrides: Partial<IStoredGame> = {}): IStoredGame {
  return {
    tenant_id: 't1',
    game_id: 'g1',
    connection_id: 'c1',
    organization_id: 'org-1',
    external_id: 'ext-1',
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
        slot_id: 's1',
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

function make_query(overrides: Partial<IUnseenGamesQuery> = {}): IUnseenGamesQuery {
  return {
    tenant_id: 't1',
    connection_id: 'c1',
    kind: SyncKind.OPEN_GAMES,
    window_start: 0,
    window_end: 5000,
    seen_run_id: 'new-run',
    organization_ids: null,
    ...overrides,
  };
}

describe('InMemoryGameStore', () => {
  describe('save_games and find_by_external_ids', () => {
    it('inserts games and finds them by external id', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'g1', external_id: 'e1' }),
        make_stored_game({ game_id: 'g2', external_id: 'e2' }),
        make_stored_game({ game_id: 'g3', external_id: 'e3' }),
      ]);

      const found = await store.find_by_external_ids('t1', 'c1', ['e1', 'e3', 'missing']);

      expect(found.map((game) => game.game_id).sort()).toEqual(['g1', 'g3']);
    });

    it('returns an empty list for an empty id list', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([make_stored_game()]);

      expect(await store.find_by_external_ids('t1', 'c1', [])).toEqual([]);
    });

    it('replaces an existing game with the same game_id', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([make_stored_game({ fingerprint: 'one' })]);
      await store.save_games([make_stored_game({ fingerprint: 'two' })]);

      const found = await store.find_by_external_ids('t1', 'c1', ['ext-1']);
      expect(found).toHaveLength(1);
      expect(found[0]?.fingerprint).toBe('two');
      expect(store.all_games()).toHaveLength(1);
    });

    it('never returns games of another tenant or connection', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'mine' }),
        make_stored_game({ game_id: 'other-tenant', tenant_id: 't2' }),
        make_stored_game({ game_id: 'other-conn', connection_id: 'c2' }),
      ]);

      const found = await store.find_by_external_ids('t1', 'c1', ['ext-1']);

      expect(found.map((game) => game.game_id)).toEqual(['mine']);
    });

    it('stores copies of saved games', async () => {
      const store = new InMemoryGameStore();
      const game = make_stored_game();
      await store.save_games([game]);

      game.fingerprint = 'mutated';
      game.slots[0]!.fees.push({ amount: 2 });
      game.raw['a'] = 2;

      const [stored] = await store.find_by_external_ids('t1', 'c1', ['ext-1']);
      expect(stored?.fingerprint).toBe('fp');
      expect(stored?.slots[0]?.fees).toEqual([{ amount: 1 }]);
      expect(stored?.raw).toEqual({ a: 1 });
    });

    it('returns copies from find_by_external_ids', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([make_stored_game()]);

      const [found] = await store.find_by_external_ids('t1', 'c1', ['ext-1']);
      found!.fingerprint = 'mutated';
      found!.slots[0]!.position = 'Mutated';

      const [again] = await store.find_by_external_ids('t1', 'c1', ['ext-1']);
      expect(again?.fingerprint).toBe('fp');
      expect(again?.slots[0]?.position).toBe('Referee');
    });
  });

  describe('all_games', () => {
    it('returns every game across tenants as copies', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'g1' }),
        make_stored_game({ game_id: 'g2', tenant_id: 't2' }),
      ]);

      const all = store.all_games();
      expect(all.map((game) => game.game_id)).toEqual(['g1', 'g2']);

      all[0]!.fingerprint = 'mutated';
      expect(store.all_games()[0]?.fingerprint).toBe('fp');
    });
  });

  describe('find_unseen', () => {
    it('selects open games for OPEN_GAMES and my games for MY_GAMES', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'open', is_open: true, is_mine: false }),
        make_stored_game({ game_id: 'mine', is_open: false, is_mine: true }),
        make_stored_game({ game_id: 'both', is_open: true, is_mine: true, start_at: 2000 }),
        make_stored_game({ game_id: 'neither', is_open: false, is_mine: false }),
      ]);

      const open = await store.find_unseen(make_query({ kind: SyncKind.OPEN_GAMES }));
      const mine = await store.find_unseen(make_query({ kind: SyncKind.MY_GAMES }));

      expect(open.map((game) => game.game_id)).toEqual(['open', 'both']);
      expect(mine.map((game) => game.game_id)).toEqual(['mine', 'both']);
    });

    it('throws for unsupported kinds', async () => {
      const store = new InMemoryGameStore();

      await expect(
        store.find_unseen(make_query({ kind: SyncKind.REFERENCE_DATA })),
      ).rejects.toThrow(/REFERENCE_DATA/);
    });

    it('includes window boundaries and excludes games outside the window', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'before', start_at: 99 }),
        make_stored_game({ game_id: 'at_start', start_at: 100 }),
        make_stored_game({ game_id: 'inside', start_at: 150 }),
        make_stored_game({ game_id: 'at_end', start_at: 200 }),
        make_stored_game({ game_id: 'after', start_at: 201 }),
      ]);

      const found = await store.find_unseen(make_query({ window_start: 100, window_end: 200 }));

      expect(found.map((game) => game.game_id)).toEqual(['at_start', 'inside', 'at_end']);
    });

    it('excludes games already seen by the given run', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'seen', last_seen_sync_run_id: 'new-run' }),
        make_stored_game({ game_id: 'unseen', last_seen_sync_run_id: 'old-run' }),
      ]);

      const found = await store.find_unseen(make_query());

      expect(found.map((game) => game.game_id)).toEqual(['unseen']);
    });

    it('restricts to the given organizations, and an empty list matches nothing', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'a', organization_id: 'org-a' }),
        make_stored_game({ game_id: 'b', organization_id: 'org-b' }),
        make_stored_game({ game_id: 'c', organization_id: 'org-c' }),
      ]);

      const some = await store.find_unseen(make_query({ organization_ids: ['org-a', 'org-c'] }));
      const none = await store.find_unseen(make_query({ organization_ids: [] }));
      const all = await store.find_unseen(make_query({ organization_ids: null }));

      expect(some.map((game) => game.game_id)).toEqual(['a', 'c']);
      expect(none).toEqual([]);
      expect(all).toHaveLength(3);
    });

    it('is scoped by tenant and connection', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'mine' }),
        make_stored_game({ game_id: 'other-tenant', tenant_id: 't2' }),
        make_stored_game({ game_id: 'other-conn', connection_id: 'c2' }),
      ]);

      const found = await store.find_unseen(make_query());

      expect(found.map((game) => game.game_id)).toEqual(['mine']);
    });

    it('sorts by start_at then game_id', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([
        make_stored_game({ game_id: 'z', start_at: 100 }),
        make_stored_game({ game_id: 'b', start_at: 300 }),
        make_stored_game({ game_id: 'a', start_at: 300 }),
        make_stored_game({ game_id: 'm', start_at: 200 }),
      ]);

      const found = await store.find_unseen(make_query());

      expect(found.map((game) => game.game_id)).toEqual(['z', 'm', 'a', 'b']);
    });

    it('returns copies', async () => {
      const store = new InMemoryGameStore();
      await store.save_games([make_stored_game()]);

      const [found] = await store.find_unseen(make_query());
      found!.fingerprint = 'mutated';
      found!.slots.length = 0;

      const [again] = await store.find_unseen(make_query());
      expect(again?.fingerprint).toBe('fp');
      expect(again?.slots).toHaveLength(1);
    });
  });
});
