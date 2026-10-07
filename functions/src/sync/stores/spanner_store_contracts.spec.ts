import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe } from 'vitest';
import { describe_game_store_contract } from './contracts/game_store.contract.js';
import { describe_organization_store_contract } from './contracts/organization_store.contract.js';
import { describe_sync_run_store_contract } from './contracts/sync_run_store.contract.js';
import { describe_venue_store_contract } from './contracts/venue_store.contract.js';
import { run_write_transaction } from './run_write_transaction.js';
import { SpannerGameStore } from './spanner_game_store.js';
import { SpannerOrganizationStore } from './spanner_organization_store.js';
import { SpannerSyncRunStore } from './spanner_sync_run_store.js';
import { SpannerVenueStore } from './spanner_venue_store.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from './spanner_emulator.fixture.js';

describe.skipIf(!is_spanner_emulator_configured())('Spanner store contracts (emulator)', () => {
  let database: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ database, close } = open_emulator_database());
  });

  afterAll(async () => {
    await close();
  });

  describe_game_store_contract('Spanner', () => new SpannerGameStore(database));

  describe_organization_store_contract('Spanner', () => ({
    store: new SpannerOrganizationStore(database),
    set_sync_enabled: async (tenant_id, organization_id, sync_enabled) => {
      await run_write_transaction(database, async (transaction) => {
        await transaction.runUpdate({
          sql:
            'UPDATE organizations SET sync_enabled = @sync_enabled ' +
            'WHERE tenant_id = @tenant_id AND organization_id = @organization_id',
          params: { tenant_id, organization_id, sync_enabled },
          types: { tenant_id: 'string', organization_id: 'string', sync_enabled: 'bool' },
        });
      });
    },
  }));

  describe_venue_store_contract('Spanner', () => ({
    store: new SpannerVenueStore(database),
    set_location_group: async (tenant_id, venue_id, label) => {
      await run_write_transaction(database, async (transaction) => {
        await transaction.runUpdate({
          sql:
            'UPDATE venues SET location_group = @label ' +
            'WHERE tenant_id = @tenant_id AND venue_id = @venue_id',
          params: { tenant_id, venue_id, label },
          types: { tenant_id: 'string', venue_id: 'string', label: 'string' },
        });
      });
    },
  }));

  describe_sync_run_store_contract('Spanner', () => new SpannerSyncRunStore(database));
});
