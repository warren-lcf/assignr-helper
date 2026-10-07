import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { INormalizedOrganization } from '../../integrations/models/normalized_organization.model.js';
import { IStoredOrganization } from '../models/stored_organization.model.js';
import { IOrganizationStore } from '../ports/organization_store.interface.js';
import { IInMemoryStoreOptions } from './in_memory_store_options.model.js';

/** In-memory `IOrganizationStore` for tests and local development. Reads and returns are copies. */
export class InMemoryOrganizationStore implements IOrganizationStore {
  private readonly rows = new Map<string, IStoredOrganization>();
  private readonly generate_id: () => string;

  /**
   * Creates an empty store.
   * @param options Optional id generator override.
   */
  public constructor(options: IInMemoryStoreOptions = {}) {
    this.generate_id = options.generate_id ?? (() => randomUUID());
  }

  /**
   * Lists a connection's organizations.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection to list.
   * @returns Copies of the stored organizations, in insertion order.
   */
  public async list_organizations(
    tenant_id: string,
    connection_id: string,
  ): Promise<IStoredOrganization[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id && row.connection_id === connection_id)
      .map((row) => structuredClone(row));
  }

  /**
   * Inserts new organizations and refreshes name and flags of existing ones.
   * Existing rows keep `organization_id`, `created_*` and `sync_enabled`; their
   * `updated_*` columns change only when name or flags changed.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the organizations belong to.
   * @param organizations Organizations from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns Copies of the stored organizations, one per input organization, in input order.
   */
  public async upsert_organizations(
    tenant_id: string,
    connection_id: string,
    organizations: INormalizedOrganization[],
    actor: string,
    now: number,
  ): Promise<IStoredOrganization[]> {
    const result: IStoredOrganization[] = [];
    for (const incoming of organizations) {
      const key = JSON.stringify([tenant_id, connection_id, incoming.external_id]);
      const existing = this.rows.get(key);
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
      } else {
        row = {
          tenant_id,
          organization_id: this.generate_id(),
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
      }
      this.rows.set(key, row);
      result.push(structuredClone(row));
    }
    return result;
  }

  /**
   * Test helper that simulates the user toggling an organization's sync switch.
   * Does not touch audit columns. Does nothing when no such organization exists in the tenant.
   * @param tenant_id Owning tenant; organizations of other tenants are never modified.
   * @param organization_id Organization to edit.
   * @param sync_enabled New value of the switch.
   * @returns Nothing.
   */
  public set_sync_enabled(tenant_id: string, organization_id: string, sync_enabled: boolean): void {
    for (const row of this.rows.values()) {
      if (row.tenant_id === tenant_id && row.organization_id === organization_id) {
        row.sync_enabled = sync_enabled;
      }
    }
  }
}
