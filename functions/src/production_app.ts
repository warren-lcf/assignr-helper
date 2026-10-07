import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import { Spanner } from '@google-cloud/spanner';
import type { Express } from 'express';
import { create_app } from './app.js';
import { create_auth_middleware } from './auth/create_auth_middleware.js';
import { FirebaseTokenVerifier } from './auth/firebase_token_verifier.js';
import { SpannerMembershipResolver } from './auth/spanner_membership_resolver.js';
import { StaticRoleStore } from './auth/static_role_store.js';
import { require_env } from './config/require_env.js';

/**
 * Builds the real application: Firebase token verification, Spanner-backed
 * membership, and the fixed role set. Reads its Spanner location from the
 * environment and throws at start-up when any of it is missing.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The Express app served by the HTTPS function.
 */
export function create_production_app(env: NodeJS.ProcessEnv = process.env): Express {
  const spanner = new Spanner({ projectId: require_env('SPANNER_PROJECT_ID', env) });
  const database = spanner
    .instance(require_env('SPANNER_INSTANCE_ID', env))
    .database(require_env('SPANNER_DATABASE_ID', env));

  const role_permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  return create_app({
    auth: {
      middleware: create_auth_middleware({
        token_verifier: new FirebaseTokenVerifier(),
        membership_resolver: new SpannerMembershipResolver(database),
        role_permission_service,
      }),
      permission_service: role_permission_service,
    },
  });
}
