import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { make_contract_tenant_id } from './contracts/make_contract_tenant_id.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from './spanner_emulator.fixture.js';
import { SpannerOrganizationStore } from './spanner_organization_store.js';

describe('SpannerOrganizationStore without a database round trip', () => {
  it('upserts nothing for empty input without opening a transaction', async () => {
    const runTransactionAsync = vi.fn();
    const store = new SpannerOrganizationStore({ runTransactionAsync } as unknown as Database);

    expect(await store.upsert_organizations('t1', 'c1', [], 'a', 1)).toEqual([]);

    expect(runTransactionAsync).not.toHaveBeenCalled();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerOrganizationStore (emulator)',
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

    it('takes new ids from the injected generator', async () => {
      let counter = 0;
      const store = new SpannerOrganizationStore(database, {
        generate_id: () => `org-${++counter}`,
      });
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_organizations(
        tenant_id,
        'c1',
        [
          { external_id: 'a', name: 'A', flags: {} },
          { external_id: 'b', name: 'B', flags: {} },
        ],
        'x',
        1,
      );

      expect(result.map((row) => row.organization_id)).toEqual(['org-1', 'org-2']);
    });

    it('reads a row without flags JSON as an empty flag set', async () => {
      const store = new SpannerOrganizationStore(database);
      const tenant_id = make_contract_tenant_id();
      await database.table('organizations').upsert({
        tenant_id,
        organization_id: 'org-1',
        connection_id: 'c1',
        external_id: 'ext-1',
        name: 'Legacy',
        sync_enabled: false,
        created_at: 1,
        created_by: 'a',
        updated_at: 1,
        updated_by: 'a',
      });

      const [listed] = await store.list_organizations(tenant_id, 'c1');

      expect(listed).toMatchObject({ flags: {}, sync_enabled: false });
    });

    it('names the column when stored flags JSON is corrupt', async () => {
      const store = new SpannerOrganizationStore(database);
      const tenant_id = make_contract_tenant_id();
      await database.table('organizations').upsert({
        tenant_id,
        organization_id: 'org-1',
        connection_id: 'c1',
        external_id: 'ext-1',
        name: 'Broken',
        flags_json: '{broken',
        sync_enabled: true,
        created_at: 1,
        created_by: 'a',
        updated_at: 1,
        updated_by: 'a',
      });

      await expect(store.list_organizations(tenant_id, 'c1')).rejects.toThrow(/flags_json/);
    });
  },
);
