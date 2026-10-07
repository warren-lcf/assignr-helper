import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from './enums/app_role.enum.js';
import { AuthErrorCode } from './enums/auth_error_code.enum.js';
import { PermissionKey } from './enums/permission_key.enum.js';
import './express_request_auth.augmentation.js';
import { IRequestAuth } from './models/request_auth.model.js';
import { require_app_permission } from './require_app_permission.js';
import { StaticRoleStore } from './static_role_store.js';

function auth_for(real_role: AppRole, effective_role: AppRole): IRequestAuth {
  const base = { uid: 'u1', email: null, tenant_id: 't1' };
  return { real: { ...base, role: real_role }, effective: { ...base, role: effective_role } };
}

function make_app(auth: IRequestAuth | undefined, permission: PermissionKey) {
  const service = create_role_permission_service({ store: new StaticRoleStore() });
  const app = express();
  app.use((req, _res, next) => {
    req.auth = auth;
    next();
  });
  app.get('/guarded', require_app_permission(permission, service), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('require_app_permission', () => {
  it('lets a role that holds the permission through', async () => {
    const app = make_app(
      auth_for(AppRole.TENANT_OWNER, AppRole.TENANT_OWNER),
      PermissionKey.SYNC_RUN,
    );

    expect((await request(app).get('/guarded')).status).toBe(200);
  });

  it('refuses a role that lacks it, naming the permission', async () => {
    const app = make_app(
      auth_for(AppRole.TENANT_MEMBER, AppRole.TENANT_MEMBER),
      PermissionKey.SYNC_RUN,
    );

    const response = await request(app).get('/guarded');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(AuthErrorCode.PERMISSION_REQUIRED);
    expect(response.body.message).toContain('sync.run');
  });

  it('checks the effective role, so viewing as a lower role removes access', async () => {
    const app = make_app(
      auth_for(AppRole.TENANT_OWNER, AppRole.TENANT_MEMBER),
      PermissionKey.SYNC_RUN,
    );

    expect((await request(app).get('/guarded')).status).toBe(403);
  });

  it('answers 401 when no auth is attached', async () => {
    const app = make_app(undefined, PermissionKey.GAMES_READ);

    const response = await request(app).get('/guarded');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe(AuthErrorCode.AUTHENTICATION_REQUIRED);
  });

  it('answers 503 and logs when the permission service fails', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.use((req, _res, next) => {
      req.auth = auth_for(AppRole.TENANT_OWNER, AppRole.TENANT_OWNER);
      next();
    });
    app.get(
      '/guarded',
      require_app_permission(PermissionKey.GAMES_READ, {
        role_has_permission: async () => {
          throw new Error('store down');
        },
      } as never),
      (_req, res) => res.json({}),
    );

    const response = await request(app).get('/guarded');

    expect(response.status).toBe(503);
    expect(error_spy).toHaveBeenCalledWith('Permission check failed', expect.any(Error));
    error_spy.mockRestore();
  });
});
