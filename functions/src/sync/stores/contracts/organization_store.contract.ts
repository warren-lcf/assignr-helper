import { describe, expect, it } from 'vitest';
import { INormalizedOrganization } from '../../../integrations/models/normalized_organization.model.js';
import { IStoredOrganization } from '../../models/stored_organization.model.js';
import { IOrganizationStoreHarness } from './organization_store_harness.model.js';
import { make_contract_tenant_id } from './make_contract_tenant_id.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Builds a provider organization.
 * @param overrides Fields to replace.
 * @returns The organization.
 */
function make_org(overrides: Partial<INormalizedOrganization> = {}): INormalizedOrganization {
  return { external_id: 'ext-1', name: 'Metro Soccer', flags: { show_all: true }, ...overrides };
}

/**
 * Orders organizations by provider id, because `list_organizations` order is unspecified.
 * @param rows Organizations to order.
 * @returns A sorted copy.
 */
function by_external_id(rows: IStoredOrganization[]): IStoredOrganization[] {
  return [...rows].sort((a, b) => (a.external_id < b.external_id ? -1 : 1));
}

/**
 * Registers the behavioural contract every `IOrganizationStore` must satisfy. Each test
 * works in fresh random tenants, so it neither assumes an empty store nor touches other
 * tenants' rows. Ids are whatever the store generates; tests only compare them with each other.
 * @param label Name of the implementation under test.
 * @param make Creates a store with its user-edit harness; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_organization_store_contract(
  label: string,
  make: () => IOrganizationStoreHarness,
): void {
  describe(`${label} organization store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    it('inserts new organizations with sync enabled and full audit stamps', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org()],
        'actor-a',
        100,
      );

      expect(result).toEqual([
        {
          tenant_id,
          organization_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          connection_id: 'c1',
          external_id: 'ext-1',
          name: 'Metro Soccer',
          flags: { show_all: true },
          sync_enabled: true,
          created_at: 100,
          created_by: 'actor-a',
          updated_at: 100,
          updated_by: 'actor-a',
        },
      ]);
      expect(await store.list_organizations(tenant_id, 'c1')).toEqual(result);
    });

    it('round-trips several flags, an empty flag set and realistic timestamps', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      await store.upsert_organizations(
        tenant_id,
        'c1',
        [
          make_org({ external_id: 'a', flags: { show_all: true, hide_fees: false, other: true } }),
          make_org({ external_id: 'b', flags: {} }),
        ],
        'actor-a',
        1786234975000,
      );

      const listed = by_external_id(await store.list_organizations(tenant_id, 'c1'));
      expect(listed.map((row) => row.flags)).toEqual([
        { show_all: true, hide_fees: false, other: true },
        {},
      ]);
      expect(listed.every((row) => row.created_at === 1786234975000)).toBe(true);
    });

    it('returns an empty list and writes nothing for empty input', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      expect(await store.upsert_organizations(tenant_id, 'c1', [], 'a', 1)).toEqual([]);
      expect(await store.list_organizations(tenant_id, 'c1')).toEqual([]);
    });

    it('returns rows in input order', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_organizations(
        tenant_id,
        'c1',
        [
          make_org({ external_id: 'b' }),
          make_org({ external_id: 'a' }),
          make_org({ external_id: 'c' }),
        ],
        'x',
        1,
      );

      expect(result.map((row) => row.external_id)).toEqual(['b', 'a', 'c']);
    });

    it('keeps id, created audit and sync_enabled but refreshes name when the name changed', async () => {
      const { store, set_sync_enabled } = make();
      const tenant_id = make_contract_tenant_id();
      const [first] = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org()],
        'actor-a',
        100,
      );
      await set_sync_enabled(tenant_id, first!.organization_id, false);

      const result = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org({ name: 'Metro Soccer League' })],
        'actor-b',
        200,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        organization_id: first!.organization_id,
        name: 'Metro Soccer League',
        sync_enabled: false,
        created_at: 100,
        created_by: 'actor-a',
        updated_at: 200,
        updated_by: 'actor-b',
      });
      expect((await store.list_organizations(tenant_id, 'c1'))[0]).toEqual(result[0]);
    });

    it('refreshes updated audit when only flags changed', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      await store.upsert_organizations(tenant_id, 'c1', [make_org()], 'actor-a', 100);

      const [result] = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org({ flags: { show_all: false } })],
        'actor-b',
        200,
      );

      expect(result).toMatchObject({
        flags: { show_all: false },
        updated_at: 200,
        updated_by: 'actor-b',
      });
      expect((await store.list_organizations(tenant_id, 'c1'))[0]).toEqual(result);
    });

    it('leaves updated audit untouched when nothing changed', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const [first] = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org()],
        'actor-a',
        100,
      );

      const [result] = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org()],
        'actor-b',
        200,
      );

      expect(result).toMatchObject({
        organization_id: first!.organization_id,
        created_at: 100,
        created_by: 'actor-a',
        updated_at: 100,
        updated_by: 'actor-a',
      });
    });

    it('matches existing rows by external id so a repeat does not create a new row', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const [first] = await store.upsert_organizations(tenant_id, 'c1', [make_org()], 'a', 1);
      const [second] = await store.upsert_organizations(tenant_id, 'c1', [make_org()], 'a', 2);

      expect(second?.organization_id).toBe(first?.organization_id);
      expect(await store.list_organizations(tenant_id, 'c1')).toHaveLength(1);
    });

    it('treats a duplicate external id within one call as the same row', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org({ name: 'First' }), make_org({ name: 'Second' })],
        'a',
        1,
      );

      expect(result).toHaveLength(2);
      expect(result[1]?.organization_id).toBe(result[0]?.organization_id);
      expect(result[0]?.name).toBe('First');
      expect(result[1]?.name).toBe('Second');
      const listed = await store.list_organizations(tenant_id, 'c1');
      expect(listed).toHaveLength(1);
      expect(listed[0]?.name).toBe('Second');
    });

    it('lists every organization of a connection', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      await store.upsert_organizations(
        tenant_id,
        'c1',
        [
          make_org({ external_id: 'b', name: 'B' }),
          make_org({ external_id: 'a', name: 'A' }),
          make_org({ external_id: 'c', name: 'C' }),
        ],
        'x',
        1,
      );

      const listed = await store.list_organizations(tenant_id, 'c1');

      expect(by_external_id(listed).map((row) => row.name)).toEqual(['A', 'B', 'C']);
    });

    it('isolates tenants and connections for list and upsert', async () => {
      const { store, set_sync_enabled } = make();
      const tenant_id = make_contract_tenant_id();
      const other_tenant_id = make_contract_tenant_id();
      const [mine] = await store.upsert_organizations(
        tenant_id,
        'c1',
        [make_org({ name: 'Mine' })],
        'a',
        1,
      );
      await store.upsert_organizations(
        other_tenant_id,
        'c1',
        [make_org({ name: 'Other tenant' })],
        'a',
        1,
      );
      await store.upsert_organizations(tenant_id, 'c2', [make_org({ name: 'Other conn' })], 'a', 1);

      // Changing and disabling the first tenant's row must not alter the other rows.
      await store.upsert_organizations(tenant_id, 'c1', [make_org({ name: 'Mine v2' })], 'b', 9);
      await set_sync_enabled(tenant_id, mine!.organization_id, false);

      expect((await store.list_organizations(tenant_id, 'c1')).map((row) => row.name)).toEqual([
        'Mine v2',
      ]);
      const other_tenant = await store.list_organizations(other_tenant_id, 'c1');
      expect(other_tenant).toHaveLength(1);
      expect(other_tenant[0]).toMatchObject({
        name: 'Other tenant',
        updated_at: 1,
        sync_enabled: true,
      });
      const other_conn = await store.list_organizations(tenant_id, 'c2');
      expect(other_conn).toHaveLength(1);
      expect(other_conn[0]).toMatchObject({
        name: 'Other conn',
        updated_at: 1,
        sync_enabled: true,
      });
      expect(await store.list_organizations(make_contract_tenant_id(), 'c1')).toEqual([]);
    });

    it('returns copies from list so callers cannot mutate the store', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      await store.upsert_organizations(tenant_id, 'c1', [make_org()], 'a', 1);

      const [listed] = await store.list_organizations(tenant_id, 'c1');
      listed!.name = 'hacked';
      listed!.flags['show_all'] = false;
      listed!.sync_enabled = false;

      const [again] = await store.list_organizations(tenant_id, 'c1');
      expect(again).toMatchObject({
        name: 'Metro Soccer',
        flags: { show_all: true },
        sync_enabled: true,
      });
    });

    it('returns copies from upsert and does not alias the input', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const input = make_org();

      const [returned] = await store.upsert_organizations(tenant_id, 'c1', [input], 'a', 1);
      returned!.name = 'hacked';
      input.flags['show_all'] = false;

      const [stored] = await store.list_organizations(tenant_id, 'c1');
      expect(stored).toMatchObject({ name: 'Metro Soccer', flags: { show_all: true } });
    });
  });
}
