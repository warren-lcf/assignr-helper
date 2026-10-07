import { randomUUID } from 'node:crypto';
import { Spanner } from '@google-cloud/spanner';
import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import {
  create_audit_log_service,
  create_spanner_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import type { ICommonSpannerDatabase } from '@hch-shared-libraries/core-server';
import { create_google_secret_manager_client } from '@hch-shared-libraries/core-server/secrets';
import { create_auth_middleware } from './auth/create_auth_middleware.js';
import { FirebaseTokenVerifier } from './auth/firebase_token_verifier.js';
import { IAppAuth } from './auth/models/app_auth.model.js';
import { SpannerMembershipResolver } from './auth/spanner_membership_resolver.js';
import { StaticRoleStore } from './auth/static_role_store.js';
import { require_env } from './config/require_env.js';
import { GamesListService } from './games/games_list.service.js';
import { ClientCredentialsTokenSource } from './connections/client_credentials_token_source.js';
import { ConnectionAdminService } from './connections/connection_admin.service.js';
import { SecretManagerCredentialVault } from './connections/secret_manager_credential_vault.js';
import { IConnectionStore } from './connections/ports/connection_store.interface.js';
import { SpannerConnectionStore } from './connections/stores/spanner_connection_store.js';
import { AssignrAccountVerifier } from './integrations/assignr/assignr_account_verifier.js';
import { AssignrTokenClient } from './integrations/assignr/assignr_token_client.js';
import { AssignrSessionFactory } from './sync/assignr_session_factory.js';
import { ConnectionSyncService } from './sync/connection_sync.service.js';
import { ISyncRunStore } from './sync/ports/sync_run_store.interface.js';
import { SpannerGameStore } from './sync/stores/spanner_game_store.js';
import { SpannerOrganizationStore } from './sync/stores/spanner_organization_store.js';
import { SpannerSyncRunStore } from './sync/stores/spanner_sync_run_store.js';
import { SpannerVenueStore } from './sync/stores/spanner_venue_store.js';

/** The real services, built once per function instance from the environment. */
export interface IProductionContext {
  auth: IAppAuth;
  connections: IConnectionStore;
  sync_runs: ISyncRunStore;
  sync_service: ConnectionSyncService;
  games_service: GamesListService;
  admin_service: ConnectionAdminService;
}

/**
 * Wires the real implementations: Firebase token verification, Spanner stores,
 * the fixed role set, and the Assignr session factory. Reads the Spanner
 * location from the environment and throws when any of it is missing.
 *
 * Each tenant's provider client credentials live in Secret Manager (one secret
 * per connection, written through the settings API); access tokens are requested
 * on demand and cached only in memory.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The wired services.
 */
export function create_production_context(
  env: NodeJS.ProcessEnv = process.env,
): IProductionContext {
  const spanner = new Spanner({ projectId: require_env('SPANNER_PROJECT_ID', env) });
  const database = spanner
    .instance(require_env('SPANNER_INSTANCE_ID', env))
    .database(require_env('SPANNER_DATABASE_ID', env));

  const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const connections = new SpannerConnectionStore(database);
  const sync_runs = new SpannerSyncRunStore(database);
  const games = new SpannerGameStore(database);
  const organizations = new SpannerOrganizationStore(database);
  const venues = new SpannerVenueStore(database);

  const secrets = create_google_secret_manager_client({
    project_id: require_env('SECRET_MANAGER_PROJECT_ID', env),
  });
  const vault = new SecretManagerCredentialVault(secrets);
  const token_client = new AssignrTokenClient();
  const token_source = new ClientCredentialsTokenSource({ vault, token_client });
  const audit = create_audit_log_service({
    store: create_spanner_audit_log_store({
      database: database as unknown as ICommonSpannerDatabase,
    }),
  });

  return {
    auth: {
      permission_service,
      middleware: create_auth_middleware({
        token_verifier: new FirebaseTokenVerifier(),
        membership_resolver: new SpannerMembershipResolver(database),
        role_permission_service: permission_service,
      }),
    },
    connections,
    sync_runs,
    sync_service: new ConnectionSyncService({
      connections,
      sessions: new AssignrSessionFactory({ token_source }),
      stores: { games, organizations, venues, runs: sync_runs },
      now: Date.now,
      generate_id: randomUUID,
    }),
    games_service: new GamesListService({ games, venues, organizations, now: Date.now }),
    admin_service: new ConnectionAdminService({
      connections,
      vault,
      verifier: new AssignrAccountVerifier({ token_client }),
      token_invalidator: token_source,
      audit,
      now: Date.now,
      generate_id: randomUUID,
    }),
  };
}
