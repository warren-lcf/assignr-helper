import { randomUUID } from 'node:crypto';
import { Database, Spanner } from '@google-cloud/spanner';
import { INormalizedVenue } from '../../integrations/models/normalized_venue.model.js';
import { IStoredVenue } from '../models/stored_venue.model.js';
import { IVenueStore } from '../ports/venue_store.interface.js';
import { run_write_transaction } from './run_write_transaction.js';
import { to_nullable_number, to_nullable_string, to_number } from './spanner_row_values.js';
import { ISpannerStoreOptions } from './spanner_store_options.model.js';

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

const VENUE_COLUMNS =
  'tenant_id, venue_id, connection_id, external_id, name, address_line, city, region, ' +
  'postal_code, latitude, longitude, time_zone, location_group, created_at, created_by, ' +
  'updated_at, updated_by';

/**
 * Spanner `IVenueStore` over the `venues` table. It uses the Spanner client directly
 * instead of core-server's CRUD helpers because sync rows are already audit-stamped by
 * the engine and per-row audit logging of bulk system sync would be noise.
 */
export class SpannerVenueStore implements IVenueStore {
  private readonly generate_id: () => string;

  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `venues` table.
   * @param options Optional id generator override.
   */
  public constructor(
    private readonly database: Database,
    options: ISpannerStoreOptions = {},
  ) {
    this.generate_id = options.generate_id ?? (() => randomUUID());
  }

  /**
   * Inserts new venues and refreshes provider-owned fields of existing ones.
   * Existing rows keep `venue_id`, `created_*` and `location_group`; their
   * `updated_*` columns change only when a provider-owned field changed. The read and
   * the write happen in one transaction; duplicate provider ids in one call update the
   * row the first occurrence created.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the venues belong to.
   * @param venues Venues from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns The stored venues, one per input venue, in input order.
   */
  public async upsert_venues(
    tenant_id: string,
    connection_id: string,
    venues: INormalizedVenue[],
    actor: string,
    now: number,
  ): Promise<IStoredVenue[]> {
    if (venues.length === 0) {
      return [];
    }
    const external_ids = [...new Set(venues.map((incoming) => incoming.external_id))];
    // Ids are reserved outside the transaction so a retry after an abort reuses them.
    const reserved_ids = new Map<string, string>();
    return run_write_transaction(this.database, async (transaction) => {
      const [found] = await transaction.run({
        sql:
          `SELECT ${VENUE_COLUMNS} FROM venues@{FORCE_INDEX=venues_by_external} ` +
          'WHERE tenant_id = @tenant_id AND connection_id = @connection_id ' +
          'AND external_id IN UNNEST(@external_ids)',
        params: { tenant_id, connection_id, external_ids },
        types: {
          tenant_id: 'string',
          connection_id: 'string',
          external_ids: { type: 'array', child: 'string' },
        },
        json: true,
      });
      const current = new Map<string, IStoredVenue>();
      for (const found_row of found as Record<string, unknown>[]) {
        const stored = this.to_venue(found_row);
        current.set(stored.external_id, stored);
      }

      const dirty = new Set<string>();
      const result: IStoredVenue[] = [];
      for (const incoming of venues) {
        const existing = current.get(incoming.external_id);
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
          const changed = PROVIDER_FIELDS.some(
            (field) => existing[field] !== provider_values[field],
          );
          row = {
            ...existing,
            ...provider_values,
            ...(changed ? { updated_at: now, updated_by: actor } : {}),
          };
          if (changed) {
            dirty.add(incoming.external_id);
          }
        } else {
          row = {
            tenant_id,
            venue_id: this.reserve_id(reserved_ids, incoming.external_id),
            connection_id,
            external_id: incoming.external_id,
            ...provider_values,
            location_group: null,
            created_at: now,
            created_by: actor,
            updated_at: now,
            updated_by: actor,
          };
          dirty.add(incoming.external_id);
        }
        current.set(incoming.external_id, row);
        result.push(structuredClone(row));
      }

      if (dirty.size > 0) {
        transaction.upsert(
          'venues',
          [...dirty].map((external_id) => this.to_mutation(current.get(external_id)!)),
        );
      }
      return result;
    });
  }

  /**
   * Returns the id reserved for a provider id, generating it on first use.
   * @param reserved_ids Ids reserved so far in this upsert, keyed by provider id.
   * @param external_id Provider id of the new row.
   * @returns The id for the new row.
   */
  private reserve_id(reserved_ids: Map<string, string>, external_id: string): string {
    let id = reserved_ids.get(external_id);
    if (id === undefined) {
      id = this.generate_id();
      reserved_ids.set(external_id, id);
    }
    return id;
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `VENUE_COLUMNS` in JSON mode.
   * @returns The stored venue.
   */
  private to_venue(row: Record<string, unknown>): IStoredVenue {
    return {
      tenant_id: String(row['tenant_id']),
      venue_id: String(row['venue_id']),
      connection_id: String(row['connection_id']),
      external_id: String(row['external_id']),
      name: String(row['name']),
      address_line: to_nullable_string(row['address_line']),
      city: to_nullable_string(row['city']),
      region: to_nullable_string(row['region']),
      postal_code: to_nullable_string(row['postal_code']),
      latitude: to_nullable_number(row['latitude'], 'latitude'),
      longitude: to_nullable_number(row['longitude'], 'longitude'),
      time_zone: to_nullable_string(row['time_zone']),
      location_group: to_nullable_string(row['location_group']),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }

  /**
   * Maps a stored venue to a table row for a mutation.
   * @param venue Complete venue.
   * @returns Column values keyed by column name.
   */
  private to_mutation(venue: IStoredVenue): Record<string, unknown> {
    return {
      tenant_id: venue.tenant_id,
      venue_id: venue.venue_id,
      connection_id: venue.connection_id,
      external_id: venue.external_id,
      name: venue.name,
      address_line: venue.address_line,
      city: venue.city,
      region: venue.region,
      postal_code: venue.postal_code,
      latitude: venue.latitude === null ? null : Spanner.float(venue.latitude),
      longitude: venue.longitude === null ? null : Spanner.float(venue.longitude),
      time_zone: venue.time_zone,
      location_group: venue.location_group,
      created_at: venue.created_at,
      created_by: venue.created_by,
      updated_at: venue.updated_at,
      updated_by: venue.updated_by,
    };
  }
}
