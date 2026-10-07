import { INormalizedVenue } from '../../integrations/models/normalized_venue.model.js';
import { IStoredVenue } from '../models/stored_venue.model.js';

/** Persistence port for venues. */
export interface IVenueStore {
  /**
   * Inserts new venues and refreshes provider-owned fields of existing ones,
   * preserving the user-editable `location_group`.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the venues belong to.
   * @param venues Venues from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns The stored venues, one per input venue.
   */
  upsert_venues(
    tenant_id: string,
    connection_id: string,
    venues: INormalizedVenue[],
    actor: string,
    now: number,
  ): Promise<IStoredVenue[]>;

  /**
   * Lists every venue of a tenant, across all of its connections.
   * @param tenant_id Owning tenant.
   * @returns Stored venues; the order is unspecified.
   */
  list_venues(tenant_id: string): Promise<IStoredVenue[]>;
}
