import type { Database } from '@google-cloud/spanner';
import { TenantType } from './enums/tenant_type.enum.js';
import { IMembership } from './models/membership.model.js';
import { IMembershipResolver } from './ports/membership_resolver.interface.js';

/** Spanner implementation of the membership lookup: a user's earliest active membership. */
export class SpannerMembershipResolver implements IMembershipResolver {
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async resolve(
    uid: string,
    requested_tenant_id: string | null,
  ): Promise<IMembership | null> {
    const tenant_filter = requested_tenant_id === null ? '' : ' AND m.tenant_id = @tenant_id';
    const params: Record<string, string> = { user_id: uid };
    if (requested_tenant_id !== null) params['tenant_id'] = requested_tenant_id;

    const [rows] = await this.database.run({
      sql:
        'SELECT m.tenant_id, m.role_slug, t.tenant_type ' +
        'FROM tenant_members@{FORCE_INDEX=tenant_members_by_user} AS m ' +
        'JOIN tenants AS t ON t.tenant_id = m.tenant_id ' +
        "WHERE m.user_id = @user_id AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'" +
        tenant_filter +
        ' ORDER BY m.created_at, m.tenant_id LIMIT 1',
      params,
      json: true,
    });
    const row = (rows as { tenant_id: string; role_slug: string; tenant_type: string }[])[0];
    if (!row) return null;
    return {
      tenant_id: row.tenant_type === (TenantType.PLATFORM as string) ? null : row.tenant_id,
      role: row.role_slug,
    };
  }
}
