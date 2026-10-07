import { randomUUID } from 'node:crypto';
import { Spanner } from '@google-cloud/spanner';
import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import { create_auth_middleware } from './auth/create_auth_middleware.js';
import { FirebaseTokenVerifier } from './auth/firebase_token_verifier.js';
import { IAppAuth } from './auth/models/app_auth.model.js';
import { SpannerMembershipResolver } from './auth/spanner_membership_resolver.js';
import { StaticRoleStore } from './auth/static_role_store.js';
import { require_env } from './config/require_env.js';
import { NotConfiguredAccessTokenSource } from './connections/not_configured_access_token_source.js';
import { IConnectionStore } from './connections/ports/connection_store.interface.js';
import { SpannerConnectionStore } from './connections/stores/spanner_connection_store.js';
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
}

/**
 * Wires the real implementations: Firebase token verification, Spanner stores,
 * the fixed role set, and the Assignr session factory. Reads the Spanner
 * location from the environment and throws when any of it is missing.
 *
 * Provider credentials are not configured yet (the OAuth connect flow is not
 * built), so syncing a connection fails clearly as "needs to be reconnected".
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
      sessions: new AssignrSessionFactory({ token_source: new NotConfiguredAccessTokenSource() }),
      stores: {
        games: new SpannerGameStore(database),
        organizations: new SpannerOrganizationStore(database),
        venues: new SpannerVenueStore(database),
        runs: sync_runs,
      },
      now: Date.now,
      generate_id: randomUUID,
    }),
  };
}
