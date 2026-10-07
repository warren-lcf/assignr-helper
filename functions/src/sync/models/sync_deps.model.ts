import { IProviderContext } from '../../integrations/models/provider_context.model.js';
import { ISchedulingProvider } from '../../integrations/ports/scheduling_provider.interface.js';
import { IGameStore } from '../ports/game_store.interface.js';
import { IOrganizationStore } from '../ports/organization_store.interface.js';
import { ISyncRunStore } from '../ports/sync_run_store.interface.js';
import { IVenueStore } from '../ports/venue_store.interface.js';

/** Everything a sync run depends on; every member is injectable for tests. */
export interface ISyncDeps {
  provider: ISchedulingProvider;
  /** Provider context for the connection being synced. */
  ctx: IProviderContext;
  games: IGameStore;
  organizations: IOrganizationStore;
  venues: IVenueStore;
  runs: ISyncRunStore;
  /** Clock returning UTC milliseconds. */
  now: () => number;
  /** Generates ids for new runs and games. */
  generate_id: () => string;
  /** Last rate-limit remaining reported by the provider, for the run log. */
  rate_limit_remaining?: () => number | null;
}
