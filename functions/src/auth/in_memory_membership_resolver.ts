import { MemberStatus } from './enums/member_status.enum.js';
import { TenantStatus } from './enums/tenant_status.enum.js';
import { TenantType } from './enums/tenant_type.enum.js';
import { IMembership } from './models/membership.model.js';
import { IMembershipRecord } from './models/membership_record.model.js';
import { IMembershipResolver } from './ports/membership_resolver.interface.js';

/**
 * In-memory {@link IMembershipResolver} over a fixed list of records, the
 * reference behaviour the Spanner resolver is held to by the shared contract.
 */
export class InMemoryMembershipResolver implements IMembershipResolver {
  public constructor(private readonly records: readonly IMembershipRecord[]) {}

  /** @inheritdoc */
  public async resolve(
    uid: string,
    requested_tenant_id: string | null,
  ): Promise<IMembership | null> {
    const candidates = this.records
      .filter(
        (record) =>
          record.user_id === uid &&
          record.member_status === MemberStatus.ACTIVE &&
          record.tenant_status === TenantStatus.ACTIVE &&
          (requested_tenant_id === null || record.tenant_id === requested_tenant_id),
      )
      .sort(
        (left, right) =>
          left.created_at - right.created_at || (left.tenant_id < right.tenant_id ? -1 : 1),
      );
    const chosen = candidates[0];
    if (!chosen) return null;
    return {
      tenant_id: chosen.tenant_type === TenantType.PLATFORM ? null : chosen.tenant_id,
      role: chosen.role_slug,
    };
  }
}
