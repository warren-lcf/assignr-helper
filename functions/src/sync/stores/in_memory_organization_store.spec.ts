import { describe, expect, it } from 'vitest';
import { INormalizedOrganization } from '../../integrations/models/normalized_organization.model.js';
import { InMemoryOrganizationStore } from './in_memory_organization_store.js';

function make_org(overrides: Partial<INormalizedOrganization> = {}): INormalizedOrganization {
  return { external_id: 'ext-1', name: 'Metro Soccer', flags: { show_all: true }, ...overrides };
}

function make_store() {
  let counter = 0;
  return new InMemoryOrganizationStore({ generate_id: () => `org-${++counter}` });
}

describe('InMemoryOrganizationStore', () => {
  it('inserts new organizations with sync enabled and full audit stamps', async () => {
    const store = make_store();

    const result = await store.upsert_organizations('t1', 'c1', [make_org()], 'actor-a', 100);

    expect(result).toEqual([
      {
        tenant_id: 't1',
        organization_id: 'org-1',
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
  });

  it('defaults to random uuid ids when no generator is given', async () => {
    const store = new InMemoryOrganizationStore();

    const [first] = await store.upsert_organizations('t1', 'c1', [make_org()], 'a', 1);

    expect(first?.organization_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns rows in input order', async () => {
    const store = make_store();

    const result = await store.upsert_organizations(
      't1',
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
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'actor-a', 100);
    store.set_sync_enabled('t1', 'org-1', false);

    const result = await store.upsert_organizations(
      't1',
      'c1',
      [make_org({ name: 'Metro Soccer League' })],
      'actor-b',
      200,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      organization_id: 'org-1',
      name: 'Metro Soccer League',
      sync_enabled: false,
      created_at: 100,
      created_by: 'actor-a',
      updated_at: 200,
      updated_by: 'actor-b',
    });
  });

  it('refreshes updated audit when only flags changed', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'actor-a', 100);

    const [result] = await store.upsert_organizations(
      't1',
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
  });

  it('leaves updated audit untouched when nothing changed', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'actor-a', 100);

    const [result] = await store.upsert_organizations('t1', 'c1', [make_org()], 'actor-b', 200);

    expect(result).toMatchObject({
      organization_id: 'org-1',
      created_at: 100,
      created_by: 'actor-a',
      updated_at: 100,
      updated_by: 'actor-a',
    });
  });

  it('matches existing rows by external id so a repeat does not create a new row', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'a', 1);
    await store.upsert_organizations('t1', 'c1', [make_org()], 'a', 2);

    expect(await store.list_organizations('t1', 'c1')).toHaveLength(1);
  });

  it('treats a duplicate external id within one call as the same row', async () => {
    const store = make_store();

    const result = await store.upsert_organizations(
      't1',
      'c1',
      [make_org({ name: 'First' }), make_org({ name: 'Second' })],
      'a',
      1,
    );

    expect(result.map((row) => row.organization_id)).toEqual(['org-1', 'org-1']);
    expect(result[1]?.name).toBe('Second');
    expect(await store.list_organizations('t1', 'c1')).toHaveLength(1);
  });

  it('isolates tenants and connections for list and upsert', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org({ name: 'Mine' })], 'a', 1);
    await store.upsert_organizations('t2', 'c1', [make_org({ name: 'Other tenant' })], 'a', 1);
    await store.upsert_organizations('t1', 'c2', [make_org({ name: 'Other conn' })], 'a', 1);

    // Upserting into t1/c1 must not alter the other rows.
    await store.upsert_organizations('t1', 'c1', [make_org({ name: 'Mine v2' })], 'b', 9);

    expect((await store.list_organizations('t1', 'c1')).map((row) => row.name)).toEqual([
      'Mine v2',
    ]);
    const other_tenant = await store.list_organizations('t2', 'c1');
    expect(other_tenant).toHaveLength(1);
    expect(other_tenant[0]).toMatchObject({ name: 'Other tenant', updated_at: 1 });
    const other_conn = await store.list_organizations('t1', 'c2');
    expect(other_conn).toHaveLength(1);
    expect(other_conn[0]).toMatchObject({ name: 'Other conn', updated_at: 1 });
    expect(await store.list_organizations('t3', 'c1')).toEqual([]);
  });

  it('returns copies from list so callers cannot mutate the store', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'a', 1);

    const [listed] = await store.list_organizations('t1', 'c1');
    listed!.name = 'hacked';
    listed!.flags['show_all'] = false;
    listed!.sync_enabled = false;

    const [again] = await store.list_organizations('t1', 'c1');
    expect(again).toMatchObject({
      name: 'Metro Soccer',
      flags: { show_all: true },
      sync_enabled: true,
    });
  });

  it('set_sync_enabled only modifies the matching tenant and organization', async () => {
    const store = make_store();
    await store.upsert_organizations('t1', 'c1', [make_org()], 'a', 1);
    await store.upsert_organizations('t2', 'c1', [make_org()], 'a', 1);

    store.set_sync_enabled('t1', 'org-2', false); // org-2 belongs to t2
    store.set_sync_enabled('t1', 'missing', false);

    expect((await store.list_organizations('t1', 'c1'))[0]?.sync_enabled).toBe(true);
    expect((await store.list_organizations('t2', 'c1'))[0]?.sync_enabled).toBe(true);

    store.set_sync_enabled('t2', 'org-2', false);
    expect((await store.list_organizations('t2', 'c1'))[0]?.sync_enabled).toBe(false);
    expect((await store.list_organizations('t1', 'c1'))[0]?.sync_enabled).toBe(true);
  });

  it('returns copies from upsert and does not alias the input', async () => {
    const store = make_store();
    const input = make_org();

    const [returned] = await store.upsert_organizations('t1', 'c1', [input], 'a', 1);
    returned!.name = 'hacked';
    input.flags['show_all'] = false;

    const [stored] = await store.list_organizations('t1', 'c1');
    expect(stored).toMatchObject({ name: 'Metro Soccer', flags: { show_all: true } });
  });
});
