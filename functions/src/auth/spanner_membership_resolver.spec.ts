import type { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe } from 'vitest';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../sync/stores/spanner_emulator.fixture.js';
import { describe_membership_resolver_contract } from './contracts/membership_resolver.contract.js';
import { IMembershipRecord } from './models/membership_record.model.js';
import { SpannerMembershipResolver } from './spanner_membership_resolver.js';

const STAMP = { created_at: 1, created_by: 'seed', updated_at: 1, updated_by: 'seed' };

describe.skipIf(!is_spanner_emulator_configured())('SpannerMembershipResolver (emulator)', () => {
  let database: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ database, close } = open_emulator_database());
  });

  afterAll(async () => {
    await close();
  });

  async function seed(records: IMembershipRecord[]): Promise<SpannerMembershipResolver> {
    const tenants = new Map<string, IMembershipRecord>();
    for (const record of records) tenants.set(record.tenant_id, record);
    if (tenants.size > 0) {
      await database.table('tenants').upsert(
        [...tenants.values()].map((record) => ({
          tenant_id: record.tenant_id,
          name: record.tenant_id,
          tenant_type: record.tenant_type,
          status: record.tenant_status,
          ...STAMP,
        })),
      );
    }
    if (records.length > 0) {
      await database.table('tenant_members').upsert(
        records.map((record) => ({
          tenant_id: record.tenant_id,
          user_id: record.user_id,
          role_slug: record.role_slug,
          status: record.member_status,
          ...STAMP,
          created_at: record.created_at,
        })),
      );
    }
    return new SpannerMembershipResolver(database);
  }

  describe_membership_resolver_contract('Spanner', seed);
});
