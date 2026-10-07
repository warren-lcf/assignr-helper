import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
  type IInMemoryAuditLog,
} from '@hch-shared-libraries/core-server/audit';
import type { Express } from 'express';
import { create_app } from '../app.js';
import { create_auth_middleware } from '../auth/create_auth_middleware.js';
import { AppRole } from '../auth/enums/app_role.enum.js';
import { MemberStatus } from '../auth/enums/member_status.enum.js';
import { TenantStatus } from '../auth/enums/tenant_status.enum.js';
import { TenantType } from '../auth/enums/tenant_type.enum.js';
import { InMemoryMembershipResolver } from '../auth/in_memory_membership_resolver.js';
import { StaticRoleStore } from '../auth/static_role_store.js';
import { ConnectionAdminService } from '../connections/connection_admin.service.js';
import { create_connections_router } from '../connections/connections.routes.js';
import { create_connections_admin_router } from '../connections/connections_admin.routes.js';
import { InMemoryCredentialVault } from '../connections/in_memory_credential_vault.js';
import { IAccountVerifier } from '../connections/ports/account_verifier.interface.js';
import { InMemoryConnectionStore } from '../connections/stores/in_memory_connection_store.js';
import { create_games_router } from '../games/games.routes.js';
import { GamesListService } from '../games/games_list.service.js';
import { ConnectionSyncService } from './connection_sync.service.js';
import { ISyncHarness, make_sync_harness } from './make_sync_harness.fixture.js';
import { create_sync_router } from './sync.routes.js';

/** Bearer tokens the routes specs sign in with. */
export const ROUTE_TOKENS = {
  owner_a: 'owner-a',
  member_a: 'member-a',
  owner_b: 'owner-b',
  admin: 'admin',
} as const;

/** Everything a routes spec needs. */
export interface IRoutesApp {
  app: Express;
  harness: ISyncHarness;
  connections: InMemoryConnectionStore;
  vault: InMemoryCredentialVault;
  /** Replace to make the fake provider accept, reject or fail credentials. */
  verifier: { verify: IAccountVerifier['verify'] };
  audit: IInMemoryAuditLog;
}

/**
 * Builds the real Express app (real auth middleware, real routers) over in-memory
 * stores and a fake provider.
 * @returns The app and the pieces a spec seeds or inspects.
 */
export function make_routes_app(): IRoutesApp {
  const harness = make_sync_harness();
  const connections = new InMemoryConnectionStore();
  const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const service = new ConnectionSyncService({
    connections,
    sessions: {
      create_session: () => ({
        provider: harness.provider,
        ctx: harness.deps.ctx,
        rate_limit_remaining: () => null,
      }),
    },
    stores: {
      games: harness.games,
      organizations: harness.organizations,
      venues: harness.venues,
      runs: harness.runs,
    },
    now: harness.deps.now,
    generate_id: harness.deps.generate_id,
  });
  const games_service = new GamesListService({
    games: harness.games,
    venues: harness.venues,
    organizations: harness.organizations,
    now: harness.clock,
  });
  const vault = new InMemoryCredentialVault();
  const audit = create_in_memory_audit_log_store();
  const verifier: IRoutesApp['verifier'] = {
    verify: async () => ({ external_account_id: 'acct-1', label: 'Metro Youth Soccer' }),
  };
  let admin_ids = 0;
  const admin_service = new ConnectionAdminService({
    connections,
    vault,
    verifier: { verify: (provider, credentials) => verifier.verify(provider, credentials) },
    token_invalidator: { invalidate: () => undefined },
    audit: create_audit_log_service({ store: audit }),
    now: harness.deps.now,
    generate_id: () => `admin-conn-${++admin_ids}`,
  });
  harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];

  const base = {
    tenant_status: TenantStatus.ACTIVE,
    member_status: MemberStatus.ACTIVE,
    created_at: 1,
  };
  const tokens: Record<string, { uid: string; email: string | null }> = {
    [ROUTE_TOKENS.owner_a]: { uid: 'u-owner-a', email: null },
    [ROUTE_TOKENS.member_a]: { uid: 'u-member-a', email: null },
    [ROUTE_TOKENS.owner_b]: { uid: 'u-owner-b', email: null },
    [ROUTE_TOKENS.admin]: { uid: 'u-admin', email: null },
  };
  const app = create_app({
    parse_json_bodies: true,
    auth: {
      permission_service,
      middleware: create_auth_middleware({
        token_verifier: { verify: async (token) => tokens[token] ?? null },
        membership_resolver: new InMemoryMembershipResolver([
          {
            ...base,
            tenant_id: 't1',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-owner-a',
            role_slug: AppRole.TENANT_OWNER,
          },
          {
            ...base,
            tenant_id: 't1',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-member-a',
            role_slug: AppRole.TENANT_MEMBER,
          },
          {
            ...base,
            tenant_id: 't2',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-owner-b',
            role_slug: AppRole.TENANT_OWNER,
          },
          {
            ...base,
            tenant_id: 'platform',
            tenant_type: TenantType.PLATFORM,
            user_id: 'u-admin',
            role_slug: AppRole.PLATFORM_ADMIN,
          },
        ]),
        role_permission_service: permission_service,
      }),
    },
    mount_protected_routes: (target) => {
      target.use('/api', create_connections_router(connections, permission_service));
      target.use('/api', create_connections_admin_router({ admin_service, permission_service }));
      target.use('/api', create_games_router({ games_service, permission_service }));
      target.use(
        '/api',
        create_sync_router({
          sync_service: service,
          connections,
          runs: harness.runs,
          permission_service,
        }),
      );
    },
  });
  return { app, harness, connections, vault, verifier, audit };
}
