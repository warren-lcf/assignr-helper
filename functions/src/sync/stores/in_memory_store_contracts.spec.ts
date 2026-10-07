import { describe_game_store_contract } from './contracts/game_store.contract.js';
import { describe_organization_store_contract } from './contracts/organization_store.contract.js';
import { describe_sync_run_store_contract } from './contracts/sync_run_store.contract.js';
import { describe_venue_store_contract } from './contracts/venue_store.contract.js';
import { InMemoryGameStore } from './in_memory_game_store.js';
import { InMemoryOrganizationStore } from './in_memory_organization_store.js';
import { InMemorySyncRunStore } from './in_memory_sync_run_store.js';
import { InMemoryVenueStore } from './in_memory_venue_store.js';

describe_game_store_contract('InMemory', () => new InMemoryGameStore());

describe_organization_store_contract('InMemory', () => {
  const store = new InMemoryOrganizationStore();
  return {
    store,
    set_sync_enabled: async (tenant_id, organization_id, sync_enabled) => {
      store.set_sync_enabled(tenant_id, organization_id, sync_enabled);
    },
  };
});

describe_venue_store_contract('InMemory', () => {
  const store = new InMemoryVenueStore();
  return {
    store,
    set_location_group: async (tenant_id, venue_id, label) => {
      store.set_location_group(tenant_id, venue_id, label);
    },
  };
});

describe_sync_run_store_contract('InMemory', () => new InMemorySyncRunStore());
