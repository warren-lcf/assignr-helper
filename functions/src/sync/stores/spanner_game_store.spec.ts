import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { make_contract_game } from './contracts/make_contract_game.js';
import { make_contract_tenant_id } from './contracts/make_contract_tenant_id.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from './spanner_emulator.fixture.js';
import { SpannerGameStore } from './spanner_game_store.js';

/**
 * Builds a database whose every entry point records the call and fails the test if used.
 * @returns The fake and its spies.
 */
function make_unused_database() {
  const spies = {
    getSnapshot: vi.fn(),
    run: vi.fn(),
    runTransactionAsync: vi.fn(),
  };
  return { spies, database: spies as unknown as Database };
}

const QUERY = {
  tenant_id: 't1',
  connection_id: 'c1',
  kind: SyncKind.OPEN_GAMES,
  window_start: 0,
  window_end: 10,
  seen_run_id: 'run',
  organization_ids: null,
};

describe('SpannerGameStore without a database round trip', () => {
  it('returns nothing for an empty external id list without querying', async () => {
    const { spies, database } = make_unused_database();

    expect(await new SpannerGameStore(database).find_by_external_ids('t1', 'c1', [])).toEqual([]);

    expect(spies.getSnapshot).not.toHaveBeenCalled();
    expect(spies.run).not.toHaveBeenCalled();
  });

  it('rejects an unsupported kind before querying', async () => {
    const { spies, database } = make_unused_database();

    await expect(
      new SpannerGameStore(database).find_unseen({ ...QUERY, kind: SyncKind.REFERENCE_DATA }),
    ).rejects.toThrow('find_unseen does not support sync kind REFERENCE_DATA');

    expect(spies.getSnapshot).not.toHaveBeenCalled();
  });

  it('returns nothing for an empty organization list without querying', async () => {
    const { spies, database } = make_unused_database();

    expect(
      await new SpannerGameStore(database).find_unseen({ ...QUERY, organization_ids: [] }),
    ).toEqual([]);

    expect(spies.getSnapshot).not.toHaveBeenCalled();
  });

  it('saves nothing for an empty list without opening a transaction', async () => {
    const { spies, database } = make_unused_database();

    await new SpannerGameStore(database).save_games([]);

    expect(spies.runTransactionAsync).not.toHaveBeenCalled();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerGameStore (emulator)',
  { timeout: 60_000 },
  () => {
    let database: Database;
    let close: () => Promise<void>;

    beforeAll(() => {
      ({ database, close } = open_emulator_database());
    });

    afterAll(async () => {
      await close();
    });

    it('returns slots in numeric order whatever order they were saved in', async () => {
      const store = new SpannerGameStore(database);
      const tenant_id = make_contract_tenant_id();
      const template = make_contract_game(tenant_id, 'g1').slots[0]!;
      await store.save_games([
        make_contract_game(tenant_id, 'g1', {
          slots: ['slot_10', 'slot_2', 'slot_1'].map((slot_id) => ({ ...template, slot_id })),
        }),
      ]);

      const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1']);

      expect(found?.slots.map((slot) => slot.slot_id)).toEqual(['slot_1', 'slot_2', 'slot_10']);
    });

    it('leaves the previous game and slots intact when a save fails', async () => {
      const store = new SpannerGameStore(database);
      const tenant_id = make_contract_tenant_id();
      const original = make_contract_game(tenant_id, 'g1', { fingerprint: 'original' });
      await store.save_games([original]);
      const template = original.slots[0]!;

      await expect(
        store.save_games([
          make_contract_game(tenant_id, 'g1', {
            fingerprint: 'broken',
            slots: [template, template],
          }),
        ]),
      ).rejects.toThrow();

      expect(await store.find_by_external_ids(tenant_id, 'c1', ['ext-g1'])).toEqual([original]);
    });

    it('reads a row with null fingerprint and last-seen run as empty strings that count as unseen', async () => {
      const store = new SpannerGameStore(database);
      const tenant_id = make_contract_tenant_id();
      await database.table('games').upsert({
        tenant_id,
        game_id: 'legacy',
        connection_id: 'c1',
        organization_id: 'org-1',
        external_id: 'ext-legacy',
        start_at: 1000,
        status: 'SCHEDULED',
        published: true,
        is_open: true,
        is_mine: false,
        created_at: 1,
        created_by: 'a',
        updated_at: 1,
        updated_by: 'a',
      });

      const [found] = await store.find_by_external_ids(tenant_id, 'c1', ['ext-legacy']);
      const unseen = await store.find_unseen({
        ...QUERY,
        tenant_id,
        window_end: 5000,
        seen_run_id: 'new-run',
      });

      expect(found).toMatchObject({
        fingerprint: '',
        last_seen_sync_run_id: '',
        raw: {},
        slots: [],
        venue_id: null,
      });
      expect(unseen.map((game) => game.game_id)).toEqual(['legacy']);
    });

    it('names the column when stored raw JSON is corrupt', async () => {
      const store = new SpannerGameStore(database);
      const tenant_id = make_contract_tenant_id();
      await store.save_games([make_contract_game(tenant_id, 'g1')]);
      await database.table('games').update({ tenant_id, game_id: 'g1', raw_json: '{broken' });

      await expect(store.find_by_external_ids(tenant_id, 'c1', ['ext-g1'])).rejects.toThrow(
        /raw_json/,
      );
    });
  },
);
