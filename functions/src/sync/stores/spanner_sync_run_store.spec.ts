import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { make_contract_run } from './contracts/make_contract_run.js';
import { make_contract_tenant_id } from './contracts/make_contract_tenant_id.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from './spanner_emulator.fixture.js';
import { SpannerSyncRunStore } from './spanner_sync_run_store.js';

/**
 * Builds a database whose `run` records its request and returns no rows.
 * @returns The `run` spy and the fake database.
 */
function make_recording_database() {
  const run = vi.fn(async (_request: unknown) => [[]]);
  return { run, database: { run } as unknown as Database };
}

describe('SpannerSyncRunStore without a database round trip', () => {
  it('binds numeric parameters as INT64 so they are not sent as floats', async () => {
    const { run, database } = make_recording_database();
    const store = new SpannerSyncRunStore(database);

    await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 1786234975000);
    await store.list_runs('t1', 'c1', 20);

    const [active_request, list_request] = run.mock.calls.map(
      ([request]) => request as { types: Record<string, string>; params: object },
    );
    expect(active_request?.types['started_after']).toBe('int64');
    expect(list_request?.types['row_limit']).toBe('int64');
    expect(list_request?.params).toMatchObject({ row_limit: 20 });
  });

  it.each([[0], [-3], [0.5], [Number.NaN]])(
    'returns no rows for limit %s without querying',
    async (limit) => {
      const { run, database } = make_recording_database();

      expect(await new SpannerSyncRunStore(database).list_runs('t1', 'c1', limit)).toEqual([]);

      expect(run).not.toHaveBeenCalled();
    },
  );

  it('returns null when no row matches', async () => {
    const { database } = make_recording_database();

    expect(
      await new SpannerSyncRunStore(database).find_active_run('t1', 'c1', SyncKind.MY_GAMES, 0),
    ).toBeNull();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerSyncRunStore (emulator)',
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

    it('reads null counts as zero and a missing error as null', async () => {
      const store = new SpannerSyncRunStore(database);
      const tenant_id = make_contract_tenant_id();
      await database.table('sync_runs').upsert({
        tenant_id,
        run_id: 'legacy',
        connection_id: 'c1',
        kind: SyncKind.OPEN_GAMES,
        status: 'RUNNING',
        started_at: 1000,
        created_at: 1,
        created_by: 'a',
        updated_at: 1,
        updated_by: 'a',
      });

      const [run] = await store.list_runs(tenant_id, 'c1', 5);

      expect(run).toMatchObject({
        seen_count: 0,
        created_count: 0,
        updated_count: 0,
        removed_count: 0,
        error: null,
        window_start: null,
        rate_limit_remaining: null,
      });
    });

    it('names the column when stored error JSON is corrupt', async () => {
      const store = new SpannerSyncRunStore(database);
      const tenant_id = make_contract_tenant_id();
      await store.save_run(make_contract_run(tenant_id, 'r1'));
      await database.table('sync_runs').update({ tenant_id, run_id: 'r1', error_json: '{broken' });

      await expect(store.list_runs(tenant_id, 'c1', 5)).rejects.toThrow(/error_json/);
    });
  },
);
