import { IMembership } from '../models/membership.model.js';

/** Port that maps a verified user to the tenant and role they act in. */
export interface IMembershipResolver {
  /**
   * Finds the user's active membership.
   * @param uid Verified user id.
   * @param requested_tenant_id Tenant the caller asked to act in, or null for their default.
   * @returns The membership, or null when the user has none (or none in the requested tenant).
   */
  resolve(uid: string, requested_tenant_id: string | null): Promise<IMembership | null>;
}
