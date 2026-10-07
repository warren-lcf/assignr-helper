import { IGameStore } from '../ports/game_store.interface.js';
import { IOrganizationStore } from '../ports/organization_store.interface.js';
import { ISyncRunStore } from '../ports/sync_run_store.interface.js';
import { IVenueStore } from '../ports/venue_store.interface.js';

/** The stores a sync reads and writes. */
export interface ISyncStores {
  games: IGameStore;
  organizations: IOrganizationStore;
  venues: IVenueStore;
  runs: ISyncRunStore;
}
