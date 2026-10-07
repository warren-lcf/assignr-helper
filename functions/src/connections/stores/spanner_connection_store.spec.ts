import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { make_contract_tenant_id } from '../../sync/stores/contracts/make_contract_tenant_id.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { ConnectionStatus } from '../enums/connection_status.enum.js';
import { describe_connection_store_contract } from './contracts/connection_store.contract.js';
import { make_contract_connection } from './contracts/make_contract_connection.js';
import { SpannerConnectionStore } from './spanner_connection_store.js';

/**
 * Builds a database whose `run` records its request and returns no rows.
 * @returns The `run` spy and the fake database.
 */
function make_recording_database() {
  const run = vi.fn(async (_request: unknown) => [[]]);
  return { run, database: { run } as unknown as Database };
}

describe('SpannerConnectionStore without a database round trip', () => {
  it('binds the limit as INT64 so it is not sent as a float', async () => {
    const { run, database } = make_recording_database();

    await new SpannerConnectionStore(database).list_syncable_connections(25);

    const [request] = run.mock.calls.map(
      ([sent]) => sent as { sql: string; types: Record<string, string>; params: object },
    );
    expect(request?.types['row_limit']).toBe('int64');
    expect(request?.params).toMatchObject({ row_limit: 25, status: ConnectionStatus.CONNECTED });
    expect(request?.sql).toContain('LIMIT @row_limit');
  });

  it.each([[0], [-3], [0.5], [Number.NaN]])(
    'returns no rows for limit %s without querying',
    async (limit) => {
      const { run, database } = make_recording_database();

      expect(await new SpannerConnectionStore(database).list_syncable_connections(limit)).toEqual(
        [],
      );

      expect(run).not.toHaveBeenCalled();
    },
  );

  it('returns null when no row matches', async () => {
    const { database } = make_recording_database();

    expect(await new SpannerConnectionStore(database).get_connection('t1', 'c1')).toBeNull();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerConnectionStore (emulator)',
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

    describe_connection_store_contract('Spanner', () => new SpannerConnectionStore(database));

    it('reads null and blank scopes_json as no scopes', async () => {
      const store = new SpannerConnectionStore(database);
      const tenant_id = make_contract_tenant_id();
      const base = {
        tenant_id,
        provider: 'ASSIGNR',
        status: 'CONNECTED',
        created_at: 1,
        created_by: 'a',
        updated_at: 1,
        updated_by: 'a',
      };
      await database.table('integration_connections').upsert([
        { ...base, connection_id: 'null_scopes', scopes_json: null },
        { ...base, connection_id: 'blank_scopes', scopes_json: '' },
      ]);

      expect((await store.get_connection(tenant_id, 'null_scopes'))?.scopes).toEqual([]);
      expect((await store.get_connection(tenant_id, 'blank_scopes'))?.scopes).toEqual([]);
    });

    it.each([
      ['is corrupt JSON', '{broken'],
      ['is valid JSON but not a list of strings', '{"read":true}'],
      ['is a list holding a non-string', '["read", 3]'],
    ])('names the column when stored scopes_json %s', async (_case, scopes_json) => {
      const store = new SpannerConnectionStore(database);
      const tenant_id = make_contract_tenant_id();
      // The row is DISCONNECTED and removed afterwards so the corrupt value can never
      // break the cross-tenant `list_syncable_connections` for other tests.
      await store.save_connection(
        make_contract_connection(tenant_id, 'c1', { status: ConnectionStatus.DISCONNECTED }),
      );
      try {
        await database
          .table('integration_connections')
          .update({ tenant_id, connection_id: 'c1', scopes_json });

        await expect(store.get_connection(tenant_id, 'c1')).rejects.toThrow(/scopes_json/);
        await expect(store.list_connections(tenant_id)).rejects.toThrow(/scopes_json/);
      } finally {
        await database.table('integration_connections').deleteRows([[tenant_id, 'c1']]);
      }
    });
  },
);
