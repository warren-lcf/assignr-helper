import { randomUUID } from 'node:crypto';
import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import { create_auth_middleware } from './create_auth_middleware.js';
import { AppRole } from './enums/app_role.enum.js';
import { MemberStatus } from './enums/member_status.enum.js';
import { TenantStatus } from './enums/tenant_status.enum.js';
import { TenantType } from './enums/tenant_type.enum.js';
import { FirebaseTokenVerifier } from './firebase_token_verifier.js';
import { InMemoryMembershipResolver } from './in_memory_membership_resolver.js';
import { StaticRoleStore } from './static_role_store.js';

const emulator_host = process.env['FIREBASE_AUTH_EMULATOR_HOST'];

/**
 * Runs the whole auth path with a REAL token from the Firebase Auth emulator
 * and the real Admin SDK: sign-up, token verification, revocation, and the
 * middleware. Skipped unless `FIREBASE_AUTH_EMULATOR_HOST` is set.
 */
describe.skipIf(!emulator_host)('auth with the Firebase Auth emulator', () => {
  let app_handle: App;
  let express_app: ReturnType<typeof create_app>;
  const tenant_id = `tenant-${randomUUID()}`;

  async function sign_up(): Promise<{ id_token: string; uid: string }> {
    const response = await fetch(
      `http://${emulator_host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${randomUUID()}@example.test`,
          password: randomUUID(),
          returnSecureToken: true,
        }),
      },
    );
    const body = (await response.json()) as { idToken: string; localId: string };
    return { id_token: body.idToken, uid: body.localId };
  }

  function build_app_for(uid: string): ReturnType<typeof create_app> {
    const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
    return create_app({
      auth: {
        permission_service,
        middleware: create_auth_middleware({
          token_verifier: new FirebaseTokenVerifier(() => getAuth(app_handle)),
          membership_resolver: new InMemoryMembershipResolver([
            {
              tenant_id,
              tenant_type: TenantType.REFEREE,
              tenant_status: TenantStatus.ACTIVE,
              user_id: uid,
              role_slug: AppRole.TENANT_OWNER,
              member_status: MemberStatus.ACTIVE,
              created_at: 1,
            },
          ]),
          role_permission_service: permission_service,
        }),
      },
    });
  }

  beforeAll(() => {
    app_handle = initializeApp(
      { projectId: 'demo-assignr-helper' },
      `auth-integration-${randomUUID()}`,
    );
  });

  afterAll(async () => {
    await deleteApp(app_handle);
  });

  it('accepts a real token and resolves the caller', async () => {
    const { id_token, uid } = await sign_up();
    express_app = build_app_for(uid);

    const response = await request(express_app)
      .get('/api/me')
      .set('Authorization', `Bearer ${id_token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ uid, tenant_id, role: AppRole.TENANT_OWNER });
  });

  it('rejects a tampered token', async () => {
    const { id_token, uid } = await sign_up();
    const tampered = `${id_token.slice(0, -4)}AAAA`;

    const response = await request(build_app_for(uid))
      .get('/api/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token whose sessions were revoked', async () => {
    const { id_token, uid } = await sign_up();
    const app = build_app_for(uid);
    expect(
      (await request(app).get('/api/me').set('Authorization', `Bearer ${id_token}`)).status,
    ).toBe(200);

    // Firebase compares whole seconds: a token issued in the same second as the revocation is not
    // counted as revoked, so let the clock move on before revoking.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await getAuth(app_handle).revokeRefreshTokens(uid);

    const response = await request(app).get('/api/me').set('Authorization', `Bearer ${id_token}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects a real user who belongs to no tenant', async () => {
    const { id_token } = await sign_up();

    const response = await request(build_app_for('someone-else'))
      .get('/api/me')
      .set('Authorization', `Bearer ${id_token}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NO_MEMBERSHIP');
  });
});
