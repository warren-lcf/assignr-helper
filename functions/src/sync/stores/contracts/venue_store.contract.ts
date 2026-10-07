import { describe, expect, it } from 'vitest';
import { INormalizedVenue } from '../../../integrations/models/normalized_venue.model.js';
import { make_contract_tenant_id } from './make_contract_tenant_id.js';
import { IVenueStoreHarness } from './venue_store_harness.model.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Builds a provider venue.
 * @param overrides Fields to replace.
 * @returns The venue.
 */
function make_venue(overrides: Partial<INormalizedVenue> = {}): INormalizedVenue {
  return {
    external_id: 'v-1',
    name: 'Field 1',
    address_line: '1 Main St',
    city: 'Leesburg',
    region: 'VA',
    postal_code: '20175',
    latitude: 39.1,
    longitude: -77.5,
    time_zone: 'America/New_York',
    ...overrides,
  };
}

/**
 * Registers the behavioural contract every `IVenueStore` must satisfy. The port has no read
 * method, so stored state is observed through a repeat upsert, whose result is built from the
 * stored row. Each test works in fresh random tenants, so it neither assumes an empty store
 * nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store with its user-edit harness; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_venue_store_contract(label: string, make: () => IVenueStoreHarness): void {
  describe(`${label} venue store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    it('inserts new venues with a null location group and full audit stamps', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'actor-a', 100);

      expect(result).toEqual([
        {
          tenant_id,
          venue_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          connection_id: 'c1',
          external_id: 'v-1',
          name: 'Field 1',
          address_line: '1 Main St',
          city: 'Leesburg',
          region: 'VA',
          postal_code: '20175',
          latitude: 39.1,
          longitude: -77.5,
          time_zone: 'America/New_York',
          location_group: null,
          created_at: 100,
          created_by: 'actor-a',
          updated_at: 100,
          updated_by: 'actor-a',
        },
      ]);
    });

    it('stores what it returned: a repeat upsert reads back identical rows without a change', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const venue = make_venue({ latitude: 39.123456789012, longitude: -77.987654321098 });
      const [first] = await store.upsert_venues(tenant_id, 'c1', [venue], 'actor-a', 1786234975000);

      const [again] = await store.upsert_venues(tenant_id, 'c1', [venue], 'actor-b', 1786239999000);

      expect(again).toEqual(first);
    });

    it('stores a venue whose optional fields are all null', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const venue = make_venue({
        address_line: null,
        city: null,
        region: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        time_zone: null,
      });
      const [first] = await store.upsert_venues(tenant_id, 'c1', [venue], 'a', 1);

      const [again] = await store.upsert_venues(tenant_id, 'c1', [venue], 'b', 2);

      expect(again).toEqual(first);
      expect(again).toMatchObject({ latitude: null, longitude: null, city: null, updated_at: 1 });
    });

    it('stores whole-number and zero coordinates exactly', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const venue = make_venue({ latitude: 40, longitude: 0 });
      await store.upsert_venues(tenant_id, 'c1', [venue], 'a', 1);

      const [again] = await store.upsert_venues(tenant_id, 'c1', [venue], 'b', 2);

      expect(again).toMatchObject({ latitude: 40, longitude: 0, updated_at: 1 });
    });

    it('returns an empty list for empty input', async () => {
      const { store } = make();

      expect(await store.upsert_venues(make_contract_tenant_id(), 'c1', [], 'a', 1)).toEqual([]);
    });

    it('returns rows in input order', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_venues(
        tenant_id,
        'c1',
        [
          make_venue({ external_id: 'b' }),
          make_venue({ external_id: 'a' }),
          make_venue({ external_id: 'c' }),
        ],
        'x',
        1,
      );

      expect(result.map((row) => row.external_id)).toEqual(['b', 'a', 'c']);
    });

    it.each([
      ['name', { name: 'Field 2' }],
      ['address_line', { address_line: '2 Main St' }],
      ['city', { city: 'Ashburn' }],
      ['region', { region: 'MD' }],
      ['postal_code', { postal_code: '20147' }],
      ['latitude', { latitude: 40 }],
      ['longitude', { longitude: -78 }],
      ['time_zone', { time_zone: 'America/Chicago' }],
    ] as [string, Partial<INormalizedVenue>][])(
      'refreshes %s and stamps updated audit while keeping id, created audit and location group',
      async (_field, change) => {
        const { store, set_location_group } = make();
        const tenant_id = make_contract_tenant_id();
        const [first] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'actor-a', 100);
        await set_location_group(tenant_id, first!.venue_id, 'North Complex');

        const [result] = await store.upsert_venues(
          tenant_id,
          'c1',
          [make_venue(change)],
          'actor-b',
          200,
        );

        expect(result).toMatchObject({
          ...change,
          venue_id: first!.venue_id,
          location_group: 'North Complex',
          created_at: 100,
          created_by: 'actor-a',
          updated_at: 200,
          updated_by: 'actor-b',
        });
        const [stored] = await store.upsert_venues(
          tenant_id,
          'c1',
          [make_venue(change)],
          'actor-c',
          300,
        );
        expect(stored).toEqual(result);
      },
    );

    it('refreshes a field to null when the provider clears it', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);

      const [result] = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ city: null })],
        'b',
        2,
      );

      expect(result).toMatchObject({ city: null, updated_at: 2, updated_by: 'b' });
      const [stored] = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ city: null })],
        'c',
        3,
      );
      expect(stored).toMatchObject({ city: null, updated_at: 2, updated_by: 'b' });
    });

    it('leaves updated audit untouched when nothing changed', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const [first] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'actor-a', 100);

      const [result] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'actor-b', 200);

      expect(result).toMatchObject({
        venue_id: first!.venue_id,
        updated_at: 100,
        updated_by: 'actor-a',
      });
    });

    it('does not create a second row on a repeat upsert', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const first = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);
      const second = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 2);

      expect(second[0]?.venue_id).toBe(first[0]?.venue_id);
    });

    it('treats a duplicate external id within one call as the same row', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ name: 'First' }), make_venue({ name: 'Second' })],
        'a',
        1,
      );

      expect(result).toHaveLength(2);
      expect(result[1]?.venue_id).toBe(result[0]?.venue_id);
      expect(result[0]?.name).toBe('First');
      expect(result[1]?.name).toBe('Second');
      const [stored] = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ name: 'Second' })],
        'a',
        2,
      );
      expect(stored).toMatchObject({
        venue_id: result[0]?.venue_id,
        name: 'Second',
        updated_at: 1,
      });
    });

    it('isolates tenants and connections', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const other_tenant_id = make_contract_tenant_id();
      const [mine] = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ name: 'Mine' })],
        'a',
        1,
      );
      const [other_tenant] = await store.upsert_venues(
        other_tenant_id,
        'c1',
        [make_venue({ name: 'Other tenant' })],
        'a',
        1,
      );
      const [other_conn] = await store.upsert_venues(
        tenant_id,
        'c2',
        [make_venue({ name: 'Other conn' })],
        'a',
        1,
      );

      expect(new Set([mine?.venue_id, other_tenant?.venue_id, other_conn?.venue_id]).size).toBe(3);

      const [again_other_tenant] = await store.upsert_venues(
        other_tenant_id,
        'c1',
        [make_venue({ name: 'Other tenant' })],
        'a',
        5,
      );
      expect(again_other_tenant).toMatchObject({ name: 'Other tenant', updated_at: 1 });

      // A change in the first tenant/connection does not leak into the others.
      const [changed] = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue({ name: 'Mine v2' })],
        'a',
        9,
      );
      expect(changed).toMatchObject({ venue_id: mine?.venue_id, name: 'Mine v2' });
      const [other_conn_again] = await store.upsert_venues(
        tenant_id,
        'c2',
        [make_venue({ name: 'Other conn' })],
        'a',
        9,
      );
      expect(other_conn_again).toMatchObject({ name: 'Other conn', updated_at: 1 });
    });

    it('keeps the location group across a sync and never counts an edit as a provider change', async () => {
      const { store, set_location_group } = make();
      const tenant_id = make_contract_tenant_id();
      const other_tenant_id = make_contract_tenant_id();
      const [first] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);
      const [other] = await store.upsert_venues(other_tenant_id, 'c1', [make_venue()], 'a', 1);

      await set_location_group(tenant_id, first!.venue_id, 'North');
      // The same venue id under another tenant is never edited.
      await set_location_group(tenant_id, other!.venue_id, 'Wrong tenant');
      await set_location_group(tenant_id, 'does-not-exist', 'Missing');

      const [t1_row] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 2);
      const [t2_row] = await store.upsert_venues(other_tenant_id, 'c1', [make_venue()], 'a', 2);
      expect(t1_row?.location_group).toBe('North');
      expect(t2_row?.location_group).toBeNull();

      await set_location_group(tenant_id, first!.venue_id, null);
      const [cleared] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 3);
      expect(cleared?.location_group).toBeNull();
      expect(cleared?.updated_at).toBe(1);
    });

    it('returns copies so callers cannot mutate the store', async () => {
      const { store } = make();
      const tenant_id = make_contract_tenant_id();
      const [returned] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);
      returned!.name = 'hacked';
      returned!.location_group = 'hacked';

      const [again] = await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);
      expect(again).toMatchObject({ name: 'Field 1', location_group: null });
    });

    describe('list_venues', () => {
      it('lists the venues of every connection of the tenant, with user edits and audit stamps', async () => {
        const { store, set_location_group } = make();
        const tenant_id = make_contract_tenant_id();
        const [first] = await store.upsert_venues(
          tenant_id,
          'c1',
          [make_venue({ external_id: 'a', name: 'Alpha' })],
          'actor-a',
          100,
        );
        const [second] = await store.upsert_venues(
          tenant_id,
          'c2',
          [make_venue({ external_id: 'a', name: 'Beta' })],
          'actor-b',
          200,
        );
        await set_location_group(tenant_id, first!.venue_id, 'North Complex');

        const listed = await store.list_venues(tenant_id);

        const by_name = [...listed].sort((a, b) => (a.name < b.name ? -1 : 1));
        expect(by_name).toEqual([{ ...first, location_group: 'North Complex' }, second]);
      });

      it('never returns another tenant venues', async () => {
        const { store } = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);
        await store.upsert_venues(
          other_tenant_id,
          'c1',
          [make_venue({ external_id: 'other', name: 'Other tenant' })],
          'a',
          1,
        );

        const listed = await store.list_venues(tenant_id);

        expect(listed.map((row) => row.name)).toEqual(['Field 1']);
      });

      it('returns nothing for a tenant that has no venues', async () => {
        const { store } = make();

        expect(await store.list_venues(make_contract_tenant_id())).toEqual([]);
      });

      it('returns copies', async () => {
        const { store } = make();
        const tenant_id = make_contract_tenant_id();
        await store.upsert_venues(tenant_id, 'c1', [make_venue()], 'a', 1);

        const [listed] = await store.list_venues(tenant_id);
        listed!.name = 'hacked';

        const [again] = await store.list_venues(tenant_id);
        expect(again?.name).toBe('Field 1');
      });
    });
  });
}
