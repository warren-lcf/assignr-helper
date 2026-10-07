import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Database } from '@google-cloud/spanner';
import { INormalizedOrganization } from '../../integrations/models/normalized_organization.model.js';
import { IStoredOrganization } from '../models/stored_organization.model.js';
import { IOrganizationStore } from '../ports/organization_store.interface.js';
import { run_write_transaction } from './run_write_transaction.js';
import { parse_json, to_boolean, to_number } from './spanner_row_values.js';
import { ISpannerStoreOptions } from './spanner_store_options.model.js';

const ORGANIZATION_COLUMNS =
  'tenant_id, organization_id, connection_id, external_id, name, flags_json, sync_enabled, ' +
  'created_at, created_by, updated_at, updated_by';

/**
 * Spanner `IOrganizationStore` over the `organizations` table. It uses the Spanner
 * client directly instead of core-server's CRUD helpers because sync rows are already
 * audit-stamped by the engine and per-row audit logging of bulk system sync would be noise.
 */
export class SpannerOrganizationStore implements IOrganizationStore {
  private readonly generate_id: () => string;

  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `organizations` table.
   * @param options Optional id generator override.
   */
  public constructor(
    private readonly database: Database,
    options: ISpannerStoreOptions = {},
  ) {
    this.generate_id = options.generate_id ?? (() => randomUUID());
  }

  /**
   * Lists a connection's organizations.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection to list.
   * @returns Stored organizations ordered by name, then provider id.
   */
  public async list_organizations(
    tenant_id: string,
    connection_id: string,
  ): Promise<IStoredOrganization[]> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${ORGANIZATION_COLUMNS} FROM organizations ` +
        'WHERE tenant_id = @tenant_id AND connection_id = @connection_id ' +
        'ORDER BY name, external_id',
      params: { tenant_id, connection_id },
      types: { tenant_id: 'string', connection_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_organization(row));
  }

  /**
   * Lists every organization of a tenant, across all of its connections.
   * @param tenant_id Owning tenant.
   * @returns Stored organizations ordered by name, then connection and provider id.
   */
  public async list_all_organizations(tenant_id: string): Promise<IStoredOrganization[]> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${ORGANIZATION_COLUMNS} FROM organizations WHERE tenant_id = @tenant_id ` +
        'ORDER BY name, connection_id, external_id',
      params: { tenant_id },
      types: { tenant_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_organization(row));
  }

  /**
   * Inserts new organizations and refreshes name and flags of existing ones.
   * Existing rows keep `organization_id`, `created_*` and `sync_enabled`; their
   * `updated_*` columns change only when name or flags changed. The read and the
   * write happen in one transaction; duplicate provider ids in one call update the
   * row the first occurrence created.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the organizations belong to.
   * @param organizations Organizations from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns The stored organizations, one per input organization, in input order.
   */
  public async upsert_organizations(
    tenant_id: string,
    connection_id: string,
    organizations: INormalizedOrganization[],
    actor: string,
    now: number,
  ): Promise<IStoredOrganization[]> {
    if (organizations.length === 0) {
      return [];
    }
    const external_ids = [...new Set(organizations.map((incoming) => incoming.external_id))];
    // Ids are reserved outside the transaction so a retry after an abort reuses them.
    const reserved_ids = new Map<string, string>();
    return run_write_transaction(this.database, async (transaction) => {
      const [found] = await transaction.run({
        sql:
          `SELECT ${ORGANIZATION_COLUMNS} FROM organizations@{FORCE_INDEX=organizations_by_external} ` +
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
      const current = new Map<string, IStoredOrganization>();
      for (const found_row of found as Record<string, unknown>[]) {
        const stored = this.to_organization(found_row);
        current.set(stored.external_id, stored);
      }

      const dirty = new Set<string>();
      const result: IStoredOrganization[] = [];
      for (const incoming of organizations) {
        const existing = current.get(incoming.external_id);
        let row: IStoredOrganization;
        if (existing) {
          const changed =
            existing.name !== incoming.name || !isDeepStrictEqual(existing.flags, incoming.flags);
          row = {
            ...existing,
            name: incoming.name,
            flags: structuredClone(incoming.flags),
            ...(changed ? { updated_at: now, updated_by: actor } : {}),
          };
          if (changed) {
            dirty.add(incoming.external_id);
          }
        } else {
          row = {
            tenant_id,
            organization_id: this.reserve_id(reserved_ids, incoming.external_id),
            connection_id,
            external_id: incoming.external_id,
            name: incoming.name,
            flags: structuredClone(incoming.flags),
            sync_enabled: true,
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
          'organizations',
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
   * @param row Row selected with `ORGANIZATION_COLUMNS` in JSON mode.
   * @returns The stored organization.
   */
  private to_organization(row: Record<string, unknown>): IStoredOrganization {
    return {
      tenant_id: String(row['tenant_id']),
      organization_id: String(row['organization_id']),
      connection_id: String(row['connection_id']),
      external_id: String(row['external_id']),
      name: String(row['name']),
      flags: parse_json<Record<string, boolean>>(row['flags_json'], 'flags_json', {}),
      sync_enabled: to_boolean(row['sync_enabled'], 'sync_enabled'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }

  /**
   * Maps a stored organization to a table row for a mutation.
   * @param organization Complete organization.
   * @returns Column values keyed by column name.
   */
  private to_mutation(organization: IStoredOrganization): Record<string, unknown> {
    return {
      tenant_id: organization.tenant_id,
      organization_id: organization.organization_id,
      connection_id: organization.connection_id,
      external_id: organization.external_id,
      name: organization.name,
      flags_json: JSON.stringify(organization.flags),
      sync_enabled: organization.sync_enabled,
      created_at: organization.created_at,
      created_by: organization.created_by,
      updated_at: organization.updated_at,
      updated_by: organization.updated_by,
    };
  }
}
