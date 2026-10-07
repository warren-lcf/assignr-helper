import { INormalizedOrganization } from '../../integrations/models/normalized_organization.model.js';
import { IStoredOrganization } from '../models/stored_organization.model.js';

/** Persistence port for organizations. */
export interface IOrganizationStore {
  /**
   * Lists a connection's organizations.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection to list.
   * @returns Stored organizations.
   */
  list_organizations(tenant_id: string, connection_id: string): Promise<IStoredOrganization[]>;

  /**
   * Inserts new organizations and refreshes name and flags of existing ones,
   * preserving the user-controlled `sync_enabled`.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection the organizations belong to.
   * @param organizations Organizations from the provider.
   * @param actor Actor to stamp.
   * @param now UTC milliseconds.
   * @returns The stored organizations, one per input organization.
   */
  upsert_organizations(
    tenant_id: string,
    connection_id: string,
    organizations: INormalizedOrganization[],
    actor: string,
    now: number,
  ): Promise<IStoredOrganization[]>;
}
