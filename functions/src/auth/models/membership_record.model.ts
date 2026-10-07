import { MemberStatus } from '../enums/member_status.enum.js';
import { TenantStatus } from '../enums/tenant_status.enum.js';
import { TenantType } from '../enums/tenant_type.enum.js';

/** One person's membership joined with its tenant, as the resolver reads it. */
export interface IMembershipRecord {
  tenant_id: string;
  tenant_type: TenantType;
  tenant_status: TenantStatus;
  user_id: string;
  role_slug: string;
  member_status: MemberStatus;
  /** UTC milliseconds; the earliest active membership is the caller's default. */
  created_at: number;
}
