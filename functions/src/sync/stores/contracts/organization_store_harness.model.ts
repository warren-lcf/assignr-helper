import { IOrganizationStore } from '../../ports/organization_store.interface.js';

/**
 * An organization store plus the user-side edit the port deliberately lacks, so the
 * contract can prove a sync never overwrites it.
 */
export interface IOrganizationStoreHarness {
  store: IOrganizationStore;
  /**
   * Simulates the user toggling an organization's sync switch without touching audit columns.
   * @param tenant_id Owning tenant.
   * @param organization_id Organization to edit.
   * @param sync_enabled New value of the switch.
   * @returns Resolves when the edit is stored.
   */
  set_sync_enabled(
    tenant_id: string,
    organization_id: string,
    sync_enabled: boolean,
  ): Promise<void>;
}
