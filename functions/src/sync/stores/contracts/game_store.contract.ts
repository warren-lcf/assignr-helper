import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../../integrations/enums/game_status.enum.js';
import { SyncKind } from '../../enums/sync_kind.enum.js';
import { IStoredGame } from '../../models/stored_game.model.js';
import { IUnseenGamesQuery } from '../../models/unseen_games_query.model.js';
import { IGameStore } from '../../ports/game_store.interface.js';
import { make_contract_game } from './make_contract_game.js';
import { make_contract_tenant_id } from './make_contract_tenant_id.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Registers the behavioural contract every `IGameStore` must satisfy. Each test works in
 * a fresh random tenant, so it neither assumes an empty store nor touches other tenants' rows.
 * Slots are always saved in ascending slot order because the in-memory store returns them
 * in saved order while the Spanner store sorts them by slot id.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_game_store_contract(label: string, make: () => IGameStore): void {
  describe(`${label} game store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    /**
     * Builds an unseen-games query for a tenant.
     * @param tenant_id Owning tenant.
     * @param overrides Fields to replace.
     * @returns The query.
     */
    const make_query = (
      tenant_id: string,
      overrides: Partial<IUnseenGamesQuery> = {},
    ): IUnseenGamesQuery => ({
      tenant_id,
      connection_id: 'c1',
      kind: SyncKind.OPEN_GAMES,
      window_start: 0,
      window_end: 5000,
      seen_run_id: 'new-run',
      organization_ids: null,
      ...overrides,
    });

    /**
     * Lists the game ids of a result.
     * @param games Games returned by a store.
     * @returns Their ids, in result order.
     */
    const ids_of = (games: IStoredGame[]): string[] => games.map((game) => game.game_id);

    describe('save_games and find_by_external_ids', () => {
      it('round-trips every field including slots, fees and raw JSON', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const game = make_contract_game(tenant_id, 'g1', {
          organization_id: 'org-9',
          venue_id: 'venue-1',
          start_at: 1786234975000,
          end_at: 1786242175000,
          game_time_zone: 'America/New_York',
          local_date: 1786147200000,
          status: GameStatus.CANCELLED,
          published: false,
          league: 'Metro League',
          age_group: 'U12',
          level: 'Premier',
          game_type: 'League',
          gender: 'Boys',
          home_team: 'Home FC',
          away_team: 'Away SC',
          is_open: false,
          is_mine: true,
          external_updated_at: 1786234000000,
          lock_version: 7,
          fingerprint: 'abc123',
          last_seen_sync_run_id: 'run-5',
          removed_at: 1786239999000,
          raw: { nested: { list: [1, 'two', null, true] }, text: 'quote " and unicode é' },
          slots: [
            {
              slot_id: 'slot_1',
              position: 'Referee',
              assignee_name: 'Pat Doe',
              assignment_external_id: 'asg-1',
              response_status: AssignmentResponseStatus.ACCEPTED,
              is_mine: true,
              lock_version: 3,
              fees: [{ amount: 55.5, label: 'Match fee' }, { amount: 10 }],
            },
            {
              slot_id: 'slot_2',
              position: 'Assistant Referee',
              assignee_name: null,
              assignment_external_id: null,
              response_status: AssignmentResponseStatus.DECLINED,
              is_mine: false,
              lock_version: null,
              fees: [],
            },
            {
              slot_id: 'slot_10',
              position: 'Fourth Official',
              assignee_name: null,
              assignment_external_id: null,
              response_status: AssignmentResponseStatus.UNRESPONDED,
              is_mine: false,
              lock_version: null,
              fees: [{ amount: 0 }],
            },
          ],
          created_at: 1786000000000,
          created_by: 'creator',
          updated_at: 1786234975000,
          updated_by: 'updater',
        });

        await store.save_games([game]);
        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found).toEqual([game]);
      });

      it('round-trips nulls, an empty slot list and empty raw JSON', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const game = make_contract_game(tenant_id, 'g1', { raw: {}, slots: [] });

        await store.save_games([game]);
        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found).toEqual([game]);
      });

      it('keeps slots with null and empty values distinct from missing ones', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const game = make_contract_game(tenant_id, 'g1', {
          league: '',
          slots: [
            {
              slot_id: 'slot_1',
              position: 'Referee',
              assignee_name: '',
              assignment_external_id: null,
              response_status: AssignmentResponseStatus.UNRESPONDED,
              is_mine: false,
              lock_version: 0,
              fees: [],
            },
          ],
        });

        await store.save_games([game]);
        const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found?.league).toBe('');
        expect(found?.slots[0]?.assignee_name).toBe('');
        expect(found?.slots[0]?.lock_version).toBe(0);
      });

      it('orders slots by the numeric part of their id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const slot = (slot_id: string) => ({
          ...make_contract_game(tenant_id, 'g1').slots[0]!,
          slot_id,
        });
        const game = make_contract_game(tenant_id, 'g1', {
          slots: [slot('slot_1'), slot('slot_2'), slot('slot_10')],
        });

        await store.save_games([game]);
        const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found?.slots.map((item) => item.slot_id)).toEqual(['slot_1', 'slot_2', 'slot_10']);
      });

      it('inserts games and finds them by external id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'g1'),
          make_contract_game(tenant_id, 'g2'),
          make_contract_game(tenant_id, 'g3'),
        ]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', [
          'ext-g1',
          'ext-g3',
          'missing',
        ]);

        expect(ids_of(found).sort()).toEqual(['g1', 'g3']);
      });

      it('returns an empty list for an empty id list', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);

        expect(await store.find_by_external_ids(tenant_id, 'c1', [])).toEqual([]);
      });

      it('returns each game once even when the id list repeats an id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1', 'ext-g1']);

        expect(ids_of(found)).toEqual(['g1']);
      });

      it('returns nothing for a tenant that has no games', async () => {
        const store = make();

        expect(await store.find_by_external_ids(make_contract_tenant_id(), 'c1', ['x'])).toEqual(
          [],
        );
      });

      it('replaces an existing game with the same game_id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1', { fingerprint: 'one' })]);
        await store.save_games([make_contract_game(tenant_id, 'g1', { fingerprint: 'two' })]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found).toHaveLength(1);
        expect(found[0]?.fingerprint).toBe('two');
      });

      it('replaces the slots of a re-saved game rather than merging them', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const slot = (slot_id: string, position: string) => ({
          ...make_contract_game(tenant_id, 'g1').slots[0]!,
          slot_id,
          position,
        });
        await store.save_games([
          make_contract_game(tenant_id, 'g1', {
            slots: [slot('slot_1', 'Referee'), slot('slot_2', 'Assistant')],
          }),
        ]);
        await store.save_games([
          make_contract_game(tenant_id, 'g1', {
            slots: [slot('slot_2', 'Changed'), slot('slot_3', 'Fourth')],
          }),
        ]);

        const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found?.slots.map((item) => [item.slot_id, item.position])).toEqual([
          ['slot_2', 'Changed'],
          ['slot_3', 'Fourth'],
        ]);
      });

      it('clears all slots when a game is re-saved without any', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);
        await store.save_games([make_contract_game(tenant_id, 'g1', { slots: [] })]);

        const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found?.slots).toEqual([]);
      });

      it('does not touch the slots of other games when re-saving one', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'g1'),
          make_contract_game(tenant_id, 'g2'),
        ]);
        await store.save_games([make_contract_game(tenant_id, 'g1', { slots: [] })]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1', 'ext-g2']);

        const by_id = new Map(found.map((game) => [game.game_id, game]));
        expect(by_id.get('g1')?.slots).toEqual([]);
        expect(by_id.get('g2')?.slots).toHaveLength(1);
      });

      it('keeps the last occurrence when one call repeats a game id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'g1', { fingerprint: 'first' }),
          make_contract_game(tenant_id, 'g1', { fingerprint: 'last' }),
        ]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

        expect(found).toHaveLength(1);
        expect(found[0]?.fingerprint).toBe('last');
      });

      it('does nothing for an empty save', async () => {
        const store = make();

        await expect(store.save_games([])).resolves.toBeUndefined();
      });

      it('saves more games than fit in one write batch', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const games = Array.from({ length: 405 }, (_, index) =>
          make_contract_game(tenant_id, `g${String(index).padStart(4, '0')}`, {
            start_at: 1000 + index,
          }),
        );

        await store.save_games(games);
        const unseen = await store.find_unseen(make_query(tenant_id, { window_end: 100000 }));

        expect(unseen).toHaveLength(405);
        expect(ids_of(unseen)).toEqual(games.map((game) => game.game_id));
        expect(unseen.every((game) => game.slots.length === 1)).toBe(true);
      });

      it('never returns games of another tenant or connection', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'mine', { external_id: 'shared-ext' }),
          make_contract_game(other_tenant_id, 'other-tenant', { external_id: 'shared-ext' }),
          make_contract_game(tenant_id, 'other-conn', {
            connection_id: 'c2',
            external_id: 'shared-ext',
          }),
        ]);

        const found = await store.find_by_external_ids(tenant_id, 'c1', ['shared-ext']);

        expect(ids_of(found)).toEqual(['mine']);
      });

      it('stores copies of saved games', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const game = make_contract_game(tenant_id, 'g1');
        await store.save_games([game]);

        game.fingerprint = 'mutated';
        game.slots[0]!.fees.push({ amount: 2 });
        game.raw['a'] = 2;

        const [stored] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);
        expect(stored?.fingerprint).toBe('fp');
        expect(stored?.slots[0]?.fees).toEqual([{ amount: 1 }]);
        expect(stored?.raw).toEqual({ a: 1 });
      });

      it('returns copies from find_by_external_ids', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);

        const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);
        found!.fingerprint = 'mutated';
        found!.slots[0]!.position = 'Mutated';

        const [again] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);
        expect(again?.fingerprint).toBe('fp');
        expect(again?.slots[0]?.position).toBe('Referee');
      });
    });

    describe('find_unseen', () => {
      it('selects open games for OPEN_GAMES and my games for MY_GAMES', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'open', { is_open: true, is_mine: false }),
          make_contract_game(tenant_id, 'mine', { is_open: false, is_mine: true }),
          make_contract_game(tenant_id, 'both', { is_open: true, is_mine: true, start_at: 2000 }),
          make_contract_game(tenant_id, 'neither', { is_open: false, is_mine: false }),
        ]);

        const open = await store.find_unseen(make_query(tenant_id, { kind: SyncKind.OPEN_GAMES }));
        const mine = await store.find_unseen(make_query(tenant_id, { kind: SyncKind.MY_GAMES }));

        expect(ids_of(open)).toEqual(['open', 'both']);
        expect(ids_of(mine)).toEqual(['mine', 'both']);
      });

      it('throws for unsupported kinds', async () => {
        const store = make();

        await expect(
          store.find_unseen(
            make_query(make_contract_tenant_id(), { kind: SyncKind.REFERENCE_DATA }),
          ),
        ).rejects.toThrow('find_unseen does not support sync kind REFERENCE_DATA');
      });

      it('throws for an unsupported kind even with an empty organization list', async () => {
        const store = make();

        await expect(
          store.find_unseen(
            make_query(make_contract_tenant_id(), {
              kind: SyncKind.REFERENCE_DATA,
              organization_ids: [],
            }),
          ),
        ).rejects.toThrow(/REFERENCE_DATA/);
      });

      it('includes window boundaries and excludes games outside the window', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'before', { start_at: 99 }),
          make_contract_game(tenant_id, 'at_start', { start_at: 100 }),
          make_contract_game(tenant_id, 'inside', { start_at: 150 }),
          make_contract_game(tenant_id, 'at_end', { start_at: 200 }),
          make_contract_game(tenant_id, 'after', { start_at: 201 }),
        ]);

        const found = await store.find_unseen(
          make_query(tenant_id, { window_start: 100, window_end: 200 }),
        );

        expect(ids_of(found)).toEqual(['at_start', 'inside', 'at_end']);
      });

      it('handles windows expressed in epoch milliseconds', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const base = 1786234975000;
        await store.save_games([
          make_contract_game(tenant_id, 'before', { start_at: base - 1 }),
          make_contract_game(tenant_id, 'at_start', { start_at: base }),
          make_contract_game(tenant_id, 'at_end', { start_at: base + 86400000 }),
          make_contract_game(tenant_id, 'after', { start_at: base + 86400001 }),
        ]);

        const found = await store.find_unseen(
          make_query(tenant_id, { window_start: base, window_end: base + 86400000 }),
        );

        expect(ids_of(found)).toEqual(['at_start', 'at_end']);
      });

      it('excludes games already seen by the given run', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'seen', { last_seen_sync_run_id: 'new-run' }),
          make_contract_game(tenant_id, 'unseen', { last_seen_sync_run_id: 'old-run' }),
        ]);

        const found = await store.find_unseen(make_query(tenant_id));

        expect(ids_of(found)).toEqual(['unseen']);
      });

      it('restricts to the given organizations, and an empty list matches nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'a', { organization_id: 'org-a' }),
          make_contract_game(tenant_id, 'b', { organization_id: 'org-b' }),
          make_contract_game(tenant_id, 'c', { organization_id: 'org-c' }),
        ]);

        const some = await store.find_unseen(
          make_query(tenant_id, { organization_ids: ['org-a', 'org-c'] }),
        );
        const none = await store.find_unseen(make_query(tenant_id, { organization_ids: [] }));
        const all = await store.find_unseen(make_query(tenant_id, { organization_ids: null }));

        expect(ids_of(some)).toEqual(['a', 'c']);
        expect(none).toEqual([]);
        expect(all).toHaveLength(3);
      });

      it('is scoped by tenant and connection', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'mine'),
          make_contract_game(other_tenant_id, 'other-tenant'),
          make_contract_game(tenant_id, 'other-conn', { connection_id: 'c2' }),
        ]);

        const found = await store.find_unseen(make_query(tenant_id));

        expect(ids_of(found)).toEqual(['mine']);
      });

      it('sorts by start_at then game_id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([
          make_contract_game(tenant_id, 'z', { start_at: 100 }),
          make_contract_game(tenant_id, 'b', { start_at: 300 }),
          make_contract_game(tenant_id, 'a', { start_at: 300 }),
          make_contract_game(tenant_id, 'm', { start_at: 200 }),
        ]);

        const found = await store.find_unseen(make_query(tenant_id));

        expect(ids_of(found)).toEqual(['z', 'm', 'a', 'b']);
      });

      it('returns complete games with their slots attached', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const game = make_contract_game(tenant_id, 'g1', {
          venue_id: 'venue-1',
          raw: { deep: { list: [1, 2] } },
        });
        await store.save_games([game, make_contract_game(tenant_id, 'g2', { slots: [] })]);

        const found = await store.find_unseen(make_query(tenant_id));

        expect(found).toHaveLength(2);
        expect(found.find((item) => item.game_id === 'g1')).toEqual(game);
        expect(found.find((item) => item.game_id === 'g2')?.slots).toEqual([]);
      });

      it('reflects a re-save that changes whether a game was seen', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);
        expect(ids_of(await store.find_unseen(make_query(tenant_id)))).toEqual(['g1']);

        await store.save_games([
          make_contract_game(tenant_id, 'g1', { last_seen_sync_run_id: 'new-run' }),
        ]);

        expect(await store.find_unseen(make_query(tenant_id))).toEqual([]);
      });

      it('returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_games([make_contract_game(tenant_id, 'g1')]);

        const [found] = await store.find_unseen(make_query(tenant_id));
        found!.fingerprint = 'mutated';
        found!.slots.length = 0;

        const [again] = await store.find_unseen(make_query(tenant_id));
        expect(again?.fingerprint).toBe('fp');
        expect(again?.slots).toHaveLength(1);
      });
    });
  });
}
