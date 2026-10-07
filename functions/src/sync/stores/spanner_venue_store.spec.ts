import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INormalizedVenue } from '../../integrations/models/normalized_venue.model.js';
import { make_contract_tenant_id } from './contracts/make_contract_tenant_id.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from './spanner_emulator.fixture.js';
import { SpannerVenueStore } from './spanner_venue_store.js';

/**
 * Builds a provider venue.
 * @param external_id Provider id.
 * @returns The venue.
 */
function make_venue(external_id: string): INormalizedVenue {
  return {
    external_id,
    name: `Venue ${external_id}`,
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    time_zone: null,
  };
}

describe('SpannerVenueStore without a database round trip', () => {
  it('upserts nothing for empty input without opening a transaction', async () => {
    const runTransactionAsync = vi.fn();
    const store = new SpannerVenueStore({ runTransactionAsync } as unknown as Database);

    expect(await store.upsert_venues('t1', 'c1', [], 'a', 1)).toEqual([]);

    expect(runTransactionAsync).not.toHaveBeenCalled();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerVenueStore (emulator)',
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
      const store = new SpannerVenueStore(database, { generate_id: () => `venue-${++counter}` });
      const tenant_id = make_contract_tenant_id();

      const result = await store.upsert_venues(
        tenant_id,
        'c1',
        [make_venue('a'), make_venue('b')],
        'x',
        1,
      );

      expect(result.map((row) => row.venue_id)).toEqual(['venue-1', 'venue-2']);
    });
  },
);
