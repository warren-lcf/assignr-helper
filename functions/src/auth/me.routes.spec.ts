import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import type { Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import {
  ACTING_TENANT_HEADER,
  EFFECTIVE_ROLE_HEADER,
  create_auth_middleware,
} from './create_auth_middleware.js';
import { AppRole } from './enums/app_role.enum.js';
import { MemberStatus } from './enums/member_status.enum.js';
import { TenantStatus } from './enums/tenant_status.enum.js';
import { TenantType } from './enums/tenant_type.enum.js';
import { InMemoryMembershipResolver } from './in_memory_membership_resolver.js';
import { IAppAuth } from './models/app_auth.model.js';
import { StaticRoleStore } from './static_role_store.js';

function make_auth(): IAppAuth {
  const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const base = {
    tenant_status: TenantStatus.ACTIVE,
    member_status: MemberStatus.ACTIVE,
    created_at: 1,
  };
  return {
    permission_service,
    middleware: create_auth_middleware({
      token_verifier: {
        verify: async (token) =>
          token === 'owner'
            ? { uid: 'u-owner', email: 'owner@example.test' }
            : token === 'admin'
              ? { uid: 'u-admin', email: null }
              : null,
      },
      membership_resolver: new InMemoryMembershipResolver([
        {
          ...base,
          tenant_id: 'tenant-a',
          tenant_type: TenantType.REFEREE,
          user_id: 'u-owner',
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
  };
}

describe('create_app with auth', () => {
  it('keeps the health route public', async () => {
    const response = await request(create_app({ auth: make_auth() })).get('/api/health');

    expect(response.status).toBe(200);
  });

  it('refuses a protected route without a token', async () => {
    const response = await request(create_app({ auth: make_auth() })).get('/api/me');

    expect(response.status).toBe(401);
  });

  it('serves no protected route at all when auth is not configured', async () => {
    const response = await request(create_app())
      .get('/api/me')
      .set('Authorization', 'Bearer owner');

    expect(response.status).toBe(404);
  });

  it('mounts protected routes after the auth middleware and only with auth', async () => {
    const app = create_app({
      auth: make_auth(),
      mount_protected_routes: (target) => {
        target.get('/api/secret', (req, res) => res.json({ uid: req.auth?.effective.uid }));
      },
    });

    expect((await request(app).get('/api/secret')).status).toBe(401);
    const signed_in = await request(app).get('/api/secret').set('Authorization', 'Bearer owner');
    expect(signed_in.body).toEqual({ uid: 'u-owner' });
  });

  it('does not call protected-route mounting when auth is absent', () => {
    let called = false;
    create_app({
      mount_protected_routes: () => {
        called = true;
      },
    });

    expect(called).toBe(false);
  });
});

describe('GET /api/me', () => {
  it('describes the caller with a sorted permission list', async () => {
    const response = await request(create_app({ auth: make_auth() }))
      .get('/api/me')
      .set('Authorization', 'Bearer owner');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      uid: 'u-owner',
      email: 'owner@example.test',
      tenant_id: 'tenant-a',
      role: AppRole.TENANT_OWNER,
      actual_tenant_id: 'tenant-a',
      actual_role: AppRole.TENANT_OWNER,
    });
    const permissions: string[] = response.body.data.permissions;
    expect(permissions).toEqual([...permissions].sort());
    expect(permissions).toContain('sync.run');
    expect(permissions).not.toContain('platform.manage');
  });

  it('shows the effective role and tenant alongside the real ones while viewing as another', async () => {
    const response = await request(create_app({ auth: make_auth() }))
      .get('/api/me')
      .set('Authorization', 'Bearer admin')
      .set(ACTING_TENANT_HEADER, 'tenant-a')
      .set(EFFECTIVE_ROLE_HEADER, AppRole.TENANT_MEMBER);

    expect(response.body.data).toMatchObject({
      tenant_id: 'tenant-a',
      role: AppRole.TENANT_MEMBER,
      actual_tenant_id: null,
      actual_role: AppRole.PLATFORM_ADMIN,
      permissions: ['games.read', 'reports.write'],
    });
  });

  it('answers 401 if reached without auth attached, and passes errors on', async () => {
    const { create_me_router } = await import('./me.routes.js');
    const express = (await import('express')).default;
    const service = create_role_permission_service({ store: new StaticRoleStore() });
    const app = express();
    app.use(create_me_router(service));
    expect((await request(app).get('/me')).status).toBe(401);

    const failing = express();
    failing.use((req, _res, next) => {
      req.auth = {
        real: { uid: 'u', email: null, tenant_id: null, role: AppRole.TENANT_OWNER },
        effective: { uid: 'u', email: null, tenant_id: null, role: AppRole.TENANT_OWNER },
      };
      next();
    });
    failing.use(
      create_me_router({
        get_permission_keys: async () => {
          throw new Error('store down');
        },
      } as never),
    );
    failing.use((_error: unknown, _req: unknown, res: Response, _next: unknown) => {
      res.status(500).json({ handled: true });
    });
    const response = await request(failing).get('/me');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ handled: true });
  });
});
