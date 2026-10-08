import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTING_TENANT_HEADER,
  EFFECTIVE_ROLE_HEADER,
  TENANT_HEADER,
  create_auth_middleware,
} from './create_auth_middleware.js';
import { AppRole } from './enums/app_role.enum.js';
import { AuthErrorCode } from './enums/auth_error_code.enum.js';
import { MemberStatus } from './enums/member_status.enum.js';
import { TenantStatus } from './enums/tenant_status.enum.js';
import { TenantType } from './enums/tenant_type.enum.js';
import './express_request_auth.augmentation.js';
import { InMemoryMembershipResolver } from './in_memory_membership_resolver.js';
import { IMembershipRecord } from './models/membership_record.model.js';
import { IVerifiedToken } from './models/verified_token.model.js';
import { StaticRoleStore } from './static_role_store.js';

function record(overrides: Partial<IMembershipRecord>): IMembershipRecord {
  return {
    tenant_id: 'tenant-a',
    tenant_type: TenantType.REFEREE,
    tenant_status: TenantStatus.ACTIVE,
    user_id: 'u-owner',
    role_slug: AppRole.TENANT_OWNER,
    member_status: MemberStatus.ACTIVE,
    created_at: 1,
    ...overrides,
  };
}

const RECORDS: IMembershipRecord[] = [
  record({}),
  record({ user_id: 'u-member', role_slug: AppRole.TENANT_MEMBER }),
  record({
    tenant_id: 'platform',
    tenant_type: TenantType.PLATFORM,
    user_id: 'u-admin',
    role_slug: AppRole.PLATFORM_ADMIN,
  }),
  record({ tenant_id: 'tenant-b', user_id: 'u-owner', created_at: 2 }),
];

const TOKENS: Record<string, IVerifiedToken> = {
  'owner-token': { uid: 'u-owner', email: 'owner@example.test' },
  'member-token': { uid: 'u-member', email: null },
  'admin-token': { uid: 'u-admin', email: 'admin@example.test' },
  'stranger-token': { uid: 'u-stranger', email: null },
};

function make_app(verify = async (token: string) => TOKENS[token] ?? null) {
  const role_permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const middleware = create_auth_middleware({
    token_verifier: { verify },
    membership_resolver: new InMemoryMembershipResolver(RECORDS),
    role_permission_service,
  });
  const app = express();
  app.use(middleware);
  app.get('/whoami', (req, res) => {
    res.json(req.auth);
  });
  return app;
}

const get = (token: string | null, headers: Record<string, string> = {}) => {
  const call = request(make_app()).get('/whoami');
  if (token) call.set('Authorization', `Bearer ${token}`);
  for (const [name, value] of Object.entries(headers)) call.set(name, value);
  return call;
};

describe('create_auth_middleware: authentication', () => {
  it('rejects a request with no bearer token', async () => {
    const response = await get(null);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: AuthErrorCode.AUTHENTICATION_REQUIRED,
      message: 'Sign in to continue',
      violations: [],
    });
  });

  it('rejects a token the verifier does not accept', async () => {
    const response = await get('forged-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe(AuthErrorCode.INVALID_TOKEN);
  });

  it('answers 503, and logs the real error, when verification cannot run', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = make_app(async () => {
      throw new Error('provider unreachable');
    });

    const response = await request(app).get('/whoami').set('Authorization', 'Bearer owner-token');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe(AuthErrorCode.AUTH_UNAVAILABLE);
    expect(JSON.stringify(response.body)).not.toContain('unreachable');
    expect(error_spy).toHaveBeenCalledWith('Token verification is unavailable', expect.any(Error));
    error_spy.mockRestore();
  });

  it('answers 503 when membership lookup fails unexpectedly', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const middleware = create_auth_middleware({
      token_verifier: { verify: async () => TOKENS['owner-token'] },
      membership_resolver: {
        resolve: async () => {
          throw new Error('database down');
        },
      },
      role_permission_service: create_role_permission_service({ store: new StaticRoleStore() }),
    });
    const app = express();
    app.use(middleware);
    app.get('/whoami', (_req, res) => res.json({}));

    const response = await request(app).get('/whoami').set('Authorization', 'Bearer owner-token');

    expect(response.status).toBe(503);
    expect(error_spy).toHaveBeenCalledWith('Auth middleware failed', expect.any(Error));
    error_spy.mockRestore();
  });

  it('rejects a verified user who belongs to no tenant', async () => {
    const response = await get('stranger-token');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.NO_MEMBERSHIP);
  });
});

describe('create_auth_middleware: context', () => {
  it('attaches the caller as both the real and effective context', async () => {
    const response = await get('owner-token');

    expect(response.status).toBe(200);
    const context = {
      uid: 'u-owner',
      email: 'owner@example.test',
      tenant_id: 'tenant-a',
      role: AppRole.TENANT_OWNER,
    };
    expect(response.body).toEqual({ real: context, effective: context });
  });

  it.each([true, false])(
    'carries the identity provider verdict on the email (%s) into both contexts',
    async (email_verified) => {
      const app = make_app(async () => ({
        uid: 'u-owner',
        email: 'owner@example.test',
        email_verified,
      }));

      const response = await request(app).get('/whoami').set('Authorization', 'Bearer any');

      expect(response.body.real.email_verified).toBe(email_verified);
      expect(response.body.effective.email_verified).toBe(email_verified);
    },
  );

  it('leaves email_verified out when the verifier did not say', async () => {
    const response = await get('owner-token');

    expect(Object.keys(response.body.real)).not.toContain('email_verified');
  });

  it('gives a platform administrator no tenant by default', async () => {
    const response = await get('admin-token');

    expect(response.body.real.tenant_id).toBeNull();
    expect(response.body.real.role).toBe(AppRole.PLATFORM_ADMIN);
  });

  it('lets a user with several tenants pick one they belong to', async () => {
    const response = await get('owner-token', { [TENANT_HEADER]: 'tenant-b' });

    expect(response.body.real.tenant_id).toBe('tenant-b');
  });

  it('refuses a tenant the user does not belong to', async () => {
    const response = await get('member-token', { [TENANT_HEADER]: 'tenant-b' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.NO_MEMBERSHIP);
  });

  it.each(['has space', 'semi;colon', 'a'.repeat(65)])(
    'refuses the malformed tenant header %j',
    async (value) => {
      const response = await get('owner-token', { [TENANT_HEADER]: value });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(AuthErrorCode.INVALID_TENANT_HEADER);
    },
  );
});

describe('create_auth_middleware: acting as another tenant', () => {
  it('lets a platform administrator act as a tenant, keeping their real identity', async () => {
    const response = await get('admin-token', { [ACTING_TENANT_HEADER]: 'tenant-a' });

    expect(response.status).toBe(200);
    expect(response.body.effective.tenant_id).toBe('tenant-a');
    expect(response.body.effective.role).toBe(AppRole.PLATFORM_ADMIN);
    expect(response.body.real.tenant_id).toBeNull();
  });

  it('refuses anyone else who asks to act as another tenant', async () => {
    const response = await get('owner-token', { [ACTING_TENANT_HEADER]: 'tenant-b' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.PERMISSION_REQUIRED);
  });

  it('refuses a malformed acting-tenant header', async () => {
    const response = await get('admin-token', { [ACTING_TENANT_HEADER]: 'bad value!' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(AuthErrorCode.INVALID_TENANT_HEADER);
  });
});

describe('create_auth_middleware: viewing as a lower role', () => {
  it('lets an owner view as a member, keeping the real role', async () => {
    const response = await get('owner-token', { [EFFECTIVE_ROLE_HEADER]: AppRole.TENANT_MEMBER });

    expect(response.status).toBe(200);
    expect(response.body.effective.role).toBe(AppRole.TENANT_MEMBER);
    expect(response.body.real.role).toBe(AppRole.TENANT_OWNER);
  });

  it('lets an administrator view as an owner while acting as a tenant', async () => {
    const response = await get('admin-token', {
      [EFFECTIVE_ROLE_HEADER]: AppRole.TENANT_OWNER,
      [ACTING_TENANT_HEADER]: 'tenant-a',
    });

    expect(response.body.effective).toMatchObject({
      role: AppRole.TENANT_OWNER,
      tenant_id: 'tenant-a',
    });
  });

  it('accepts a role equal to the caller own role as a no-op', async () => {
    const response = await get('member-token', { [EFFECTIVE_ROLE_HEADER]: AppRole.TENANT_MEMBER });

    expect(response.status).toBe(200);
    expect(response.body.effective.role).toBe(AppRole.TENANT_MEMBER);
  });

  it.each([
    ['a higher role', 'member-token', AppRole.TENANT_OWNER],
    ['the highest role', 'owner-token', AppRole.PLATFORM_ADMIN],
    ['an unknown role', 'owner-token', 'SUPER_USER'],
    ['a malformed role', 'owner-token', 'not a role'],
  ])('refuses %s', async (_label, token, role) => {
    const response = await get(token, { [EFFECTIVE_ROLE_HEADER]: role });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.ROLE_NOT_ASSUMABLE);
  });

  it('refuses a repeated role header instead of picking one', async () => {
    const response = await request(make_app())
      .get('/whoami')
      .set('Authorization', 'Bearer owner-token')
      .set(EFFECTIVE_ROLE_HEADER, `${AppRole.TENANT_MEMBER}, ${AppRole.PLATFORM_ADMIN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.ROLE_NOT_ASSUMABLE);
  });
});
