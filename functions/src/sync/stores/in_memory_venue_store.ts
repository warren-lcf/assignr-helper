import { randomUUID } from 'node:crypto';
import { INormalizedVenue } from '../../integrations/models/normalized_venue.model.js';
import { IStoredVenue } from '../models/stored_venue.model.js';
import { IVenueStore } from '../ports/venue_store.interface.js';
import { IInMemoryStoreOptions } from './in_memory_store_options.model.js';

/** Provider-owned venue fields, refreshed on every sync. */
type ProviderVenueField = Exclude<keyof INormalizedVenue, 'external_id'>;

const PROVIDER_FIELDS: ProviderVenueField[] = [
  'name',
  'address_line',
  'city',
  'region',
  'postal_code',
  'latitude',
  'longitude',
  'time_zone',
];

/** In-memory `IVenueStore` for tests and local development. Reads and returns are copies. */
export class InMemoryVenueStore implements IVenueStore {
  private readonly rows = new Map<string, IStoredVenue>();
  private readonly generate_id: () => string;

  /**
   * Creates an empty store.
   * @param options Optional id generator override.
   */
  public constructor(options: IInMemoryStoreOptions = {}) {
    this.generate_id = options.generate_id ?? (() => randomUUID());
  }

  /**
   * Inserts new venues and refreshes provider-owned fields of existing ones.
   * Existing rows keep `venue_id`, `created_*` and `location_group`; their
   * `updated_*` columns change only when a provider-owned field changed.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the venues belong to.
   * @param venues Venues from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns Copies of the stored venues, one per input venue, in input order.
   */
  public async upsert_venues(
    tenant_id: string,
    connection_id: string,
    venues: INormalizedVenue[],
    actor: string,
    now: number,
  ): Promise<IStoredVenue[]> {
    const result: IStoredVenue[] = [];
    for (const incoming of venues) {
      const key = JSON.stringify([tenant_id, connection_id, incoming.external_id]);
      const existing = this.rows.get(key);
      const provider_values = {
        name: incoming.name,
        address_line: incoming.address_line,
        city: incoming.city,
        region: incoming.region,
        postal_code: incoming.postal_code,
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        time_zone: incoming.time_zone,
      };
      let row: IStoredVenue;
      if (existing) {
        const changed = PROVIDER_FIELDS.some((field) => existing[field] !== provider_values[field]);
        row = {
          ...existing,
          ...provider_values,
          ...(changed ? { updated_at: now, updated_by: actor } : {}),
        };
      } else {
        row = {
          tenant_id,
          venue_id: this.generate_id(),
          connection_id,
          external_id: incoming.external_id,
          ...provider_values,
          location_group: null,
          created_at: now,
          created_by: actor,
          updated_at: now,
          updated_by: actor,
        };
      }
      this.rows.set(key, row);
      result.push(structuredClone(row));
    }
    return result;
  }

  /**
   * Lists every venue of a tenant, across all of its connections.
   * @param tenant_id Owning tenant.
   * @returns Copies of the stored venues, in insertion order.
   */
  public async list_venues(tenant_id: string): Promise<IStoredVenue[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id)
      .map((row) => structuredClone(row));
  }

  /**
   * Test helper that simulates the user editing a venue's location group.
   * Does not touch audit columns. Does nothing when no such venue exists in the tenant.
   * @param tenant_id Owning tenant; venues of other tenants are never modified.
   * @param venue_id Venue to edit.
   * @param label New label, or null to clear it.
   * @returns Nothing.
   */
  public set_location_group(tenant_id: string, venue_id: string, label: string | null): void {
    for (const row of this.rows.values()) {
      if (row.tenant_id === tenant_id && row.venue_id === venue_id) {
        row.location_group = label;
      }
    }
  }
}
