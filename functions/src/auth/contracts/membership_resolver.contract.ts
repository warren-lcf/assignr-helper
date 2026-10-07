import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../enums/app_role.enum.js';
import { MemberStatus } from '../enums/member_status.enum.js';
import { TenantStatus } from '../enums/tenant_status.enum.js';
import { TenantType } from '../enums/tenant_type.enum.js';
import { IMembershipRecord } from '../models/membership_record.model.js';
import { IMembershipResolver } from '../ports/membership_resolver.interface.js';

/** Generous per-test timeout so a resolver backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/** Builds a resolver over the given records (seeding a real database when needed). */
export type MembershipResolverFactory = (
  records: IMembershipRecord[],
) => Promise<IMembershipResolver>;

/**
 * Registers the behaviour every {@link IMembershipResolver} must have. Each test
 * uses fresh random ids, so it is safe on a database that holds other data.
 * @param label Name of the implementation under test.
 * @param make Factory that seeds the records and returns the resolver.
 * @returns Nothing; registers a Vitest `describe`.
 */
export function describe_membership_resolver_contract(
  label: string,
  make: MembershipResolverFactory,
): void {
  const unique = (prefix: string): string => `${prefix}-${randomUUID()}`;

  function record(overrides: Partial<IMembershipRecord>): IMembershipRecord {
    return {
      tenant_id: unique('tenant'),
      tenant_type: TenantType.REFEREE,
      tenant_status: TenantStatus.ACTIVE,
      user_id: unique('user'),
      role_slug: AppRole.TENANT_OWNER,
      member_status: MemberStatus.ACTIVE,
      created_at: 1000,
      ...overrides,
    };
  }

  describe(`${label} membership resolver contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    it('returns the tenant and role of an active membership', async () => {
      const mine = record({ role_slug: AppRole.TENANT_MEMBER });
      const resolver = await make([mine]);

      expect(await resolver.resolve(mine.user_id, null)).toEqual({
        tenant_id: mine.tenant_id,
        role: AppRole.TENANT_MEMBER,
      });
    });

    it('returns null for a user with no membership', async () => {
      const resolver = await make([record({})]);

      expect(await resolver.resolve(unique('nobody'), null)).toBeNull();
    });

    it('defaults to the earliest membership', async () => {
      const user_id = unique('user');
      const later = record({ user_id, created_at: 2000 });
      const earlier = record({ user_id, created_at: 1000 });
      const resolver = await make([later, earlier]);

      expect((await resolver.resolve(user_id, null))?.tenant_id).toBe(earlier.tenant_id);
    });

    it('picks the requested tenant when the user belongs to it', async () => {
      const user_id = unique('user');
      const first = record({ user_id, created_at: 1000 });
      const second = record({ user_id, created_at: 2000, role_slug: AppRole.TENANT_MEMBER });
      const resolver = await make([first, second]);

      expect(await resolver.resolve(user_id, second.tenant_id)).toEqual({
        tenant_id: second.tenant_id,
        role: AppRole.TENANT_MEMBER,
      });
    });

    it('returns null, not a fallback, for a tenant the user does not belong to', async () => {
      const mine = record({});
      const resolver = await make([mine, record({})]);

      expect(await resolver.resolve(mine.user_id, unique('other-tenant'))).toBeNull();
    });

    it('does not return another user membership', async () => {
      const theirs = record({});
      const resolver = await make([theirs]);

      expect(await resolver.resolve(unique('someone-else'), theirs.tenant_id)).toBeNull();
    });

    it('ignores a suspended membership', async () => {
      const suspended = record({ member_status: MemberStatus.SUSPENDED });
      const resolver = await make([suspended]);

      expect(await resolver.resolve(suspended.user_id, null)).toBeNull();
    });

    it('ignores a membership in a suspended tenant', async () => {
      const in_suspended_tenant = record({ tenant_status: TenantStatus.SUSPENDED });
      const resolver = await make([in_suspended_tenant]);

      expect(await resolver.resolve(in_suspended_tenant.user_id, null)).toBeNull();
    });

    it('reports a platform administrator as having no tenant', async () => {
      const admin = record({
        tenant_type: TenantType.PLATFORM,
        role_slug: AppRole.PLATFORM_ADMIN,
      });
      const resolver = await make([admin]);

      expect(await resolver.resolve(admin.user_id, null)).toEqual({
        tenant_id: null,
        role: AppRole.PLATFORM_ADMIN,
      });
    });
  });
}
