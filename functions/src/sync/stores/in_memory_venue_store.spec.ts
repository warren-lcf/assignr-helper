import { describe, expect, it } from 'vitest';
import { INormalizedVenue } from '../../integrations/models/normalized_venue.model.js';
import { InMemoryVenueStore } from './in_memory_venue_store.js';

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

function make_store() {
  let counter = 0;
  return new InMemoryVenueStore({ generate_id: () => `venue-${++counter}` });
}

describe('InMemoryVenueStore', () => {
  it('inserts new venues with a null location group and full audit stamps', async () => {
    const store = make_store();

    const result = await store.upsert_venues('t1', 'c1', [make_venue()], 'actor-a', 100);

    expect(result).toEqual([
      {
        tenant_id: 't1',
        venue_id: 'venue-1',
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

  it('defaults to random uuid ids when no generator is given', async () => {
    const store = new InMemoryVenueStore();

    const [first] = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1);

    expect(first?.venue_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns rows in input order', async () => {
    const store = make_store();

    const result = await store.upsert_venues(
      't1',
      'c1',
      [make_venue({ external_id: 'b' }), make_venue({ external_id: 'a' })],
      'x',
      1,
    );

    expect(result.map((row) => row.external_id)).toEqual(['b', 'a']);
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
      const store = make_store();
      await store.upsert_venues('t1', 'c1', [make_venue()], 'actor-a', 100);
      store.set_location_group('t1', 'venue-1', 'North Complex');

      const [result] = await store.upsert_venues('t1', 'c1', [make_venue(change)], 'actor-b', 200);

      expect(result).toMatchObject({
        ...change,
        venue_id: 'venue-1',
        location_group: 'North Complex',
        created_at: 100,
        created_by: 'actor-a',
        updated_at: 200,
        updated_by: 'actor-b',
      });
    },
  );

  it('refreshes a field to null when the provider clears it', async () => {
    const store = make_store();
    await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1);

    const [result] = await store.upsert_venues('t1', 'c1', [make_venue({ city: null })], 'b', 2);

    expect(result).toMatchObject({ city: null, updated_at: 2, updated_by: 'b' });
  });

  it('leaves updated audit untouched when nothing changed', async () => {
    const store = make_store();
    await store.upsert_venues('t1', 'c1', [make_venue()], 'actor-a', 100);

    const [result] = await store.upsert_venues('t1', 'c1', [make_venue()], 'actor-b', 200);

    expect(result).toMatchObject({
      venue_id: 'venue-1',
      updated_at: 100,
      updated_by: 'actor-a',
    });
  });

  it('does not create a second row on a repeat upsert', async () => {
    const store = make_store();
    const first = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1);
    const second = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 2);

    expect(second[0]?.venue_id).toBe(first[0]?.venue_id);
  });

  it('isolates tenants and connections', async () => {
    const store = make_store();
    const [mine] = await store.upsert_venues('t1', 'c1', [make_venue({ name: 'Mine' })], 'a', 1);
    const [other_tenant] = await store.upsert_venues(
      't2',
      'c1',
      [make_venue({ name: 'Other tenant' })],
      'a',
      1,
    );
    const [other_conn] = await store.upsert_venues(
      't1',
      'c2',
      [make_venue({ name: 'Other conn' })],
      'a',
      1,
    );

    expect(new Set([mine?.venue_id, other_tenant?.venue_id, other_conn?.venue_id]).size).toBe(3);

    const [again_other_tenant] = await store.upsert_venues(
      't2',
      'c1',
      [make_venue({ name: 'Other tenant' })],
      'a',
      5,
    );
    expect(again_other_tenant).toMatchObject({ name: 'Other tenant', updated_at: 1 });

    // A change in t1/c1 does not leak into the others.
    const [changed] = await store.upsert_venues(
      't1',
      'c1',
      [make_venue({ name: 'Mine v2' })],
      'a',
      9,
    );
    expect(changed).toMatchObject({ venue_id: mine?.venue_id, name: 'Mine v2' });
    const [other_conn_again] = await store.upsert_venues(
      't1',
      'c2',
      [make_venue({ name: 'Other conn' })],
      'a',
      9,
    );
    expect(other_conn_again).toMatchObject({ name: 'Other conn', updated_at: 1 });
  });

  it('set_location_group changes only the matching tenant venue and can clear the label', async () => {
    const store = make_store();
    await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1); // venue-1
    await store.upsert_venues('t2', 'c1', [make_venue()], 'a', 1); // venue-2

    store.set_location_group('t1', 'venue-2', 'Wrong tenant');
    store.set_location_group('t1', 'nope', 'Missing');
    store.set_location_group('t1', 'venue-1', 'North');

    const [t1_row] = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 2);
    const [t2_row] = await store.upsert_venues('t2', 'c1', [make_venue()], 'a', 2);
    expect(t1_row?.location_group).toBe('North');
    expect(t2_row?.location_group).toBeNull();

    store.set_location_group('t1', 'venue-1', null);
    const [cleared] = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 3);
    expect(cleared?.location_group).toBeNull();
    // Editing the group does not count as a provider change.
    expect(cleared?.updated_at).toBe(1);
  });

  it('returns copies so callers cannot mutate the store', async () => {
    const store = make_store();
    const [returned] = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1);
    returned!.name = 'hacked';
    returned!.location_group = 'hacked';

    const [again] = await store.upsert_venues('t1', 'c1', [make_venue()], 'a', 1);
    expect(again).toMatchObject({ name: 'Field 1', location_group: null });
  });
});
