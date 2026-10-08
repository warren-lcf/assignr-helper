import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { to_acting_user } from './to_acting_user.js';

describe('to_acting_user', () => {
  it('uses the real person and both roles', () => {
    const req = {
      auth: {
        real: { uid: 'u-admin', email: null, tenant_id: null, role: 'PLATFORM_ADMIN' },
        effective: { uid: 'u-admin', email: null, tenant_id: 't1', role: 'TENANT_OWNER' },
      },
    } as unknown as Request;

    expect(to_acting_user(req, 't1')).toEqual({
      tenant_id: 't1',
      user_id: 'u-admin',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
  });

  it('falls back to empty strings when no auth is attached', () => {
    expect(to_acting_user({} as Request, 't1')).toEqual({
      tenant_id: 't1',
      user_id: '',
      actual_role: '',
      effective_role: '',
    });
  });
});
