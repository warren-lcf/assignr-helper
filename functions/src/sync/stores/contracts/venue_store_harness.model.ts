import { IVenueStore } from '../../ports/venue_store.interface.js';

/**
 * A venue store plus the user-side edit the port deliberately lacks, so the contract can
 * prove a sync never overwrites it.
 */
export interface IVenueStoreHarness {
  store: IVenueStore;
  /**
   * Simulates the user editing a venue's location group without touching audit columns.
   * @param tenant_id Owning tenant.
   * @param venue_id Venue to edit.
   * @param label New label, or null to clear it.
   * @returns Resolves when the edit is stored.
   */
  set_location_group(tenant_id: string, venue_id: string, label: string | null): Promise<void>;
}
