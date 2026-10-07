import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import { describe, expect, it } from 'vitest';
import { AppRole } from './enums/app_role.enum.js';
import { PermissionKey } from './enums/permission_key.enum.js';
import { StaticRoleStore } from './static_role_store.js';

describe('StaticRoleStore', () => {
  const store = new StaticRoleStore();

  it('lists the three system roles as read-only system roles', async () => {
    const roles = await store.list_roles();

    expect(roles.map((role) => role.slug)).toEqual([
      AppRole.PLATFORM_ADMIN,
      AppRole.TENANT_OWNER,
      AppRole.TENANT_MEMBER,
    ]);
    expect(roles.every((role) => role.is_system_role)).toBe(true);
  });

  it('finds a role by slug or id, and returns null for an unknown one', async () => {
    expect((await store.get_role_by_slug(AppRole.TENANT_OWNER))?.name).toBe('Tenant owner');
    expect((await store.get_role_by_id(AppRole.TENANT_OWNER))?.slug).toBe(AppRole.TENANT_OWNER);
    expect(await store.get_role_by_slug('NOPE')).toBeNull();
  });

  it('grants permissions by role, and none for an unknown role', async () => {
    const member = await store.get_permission_keys(AppRole.TENANT_MEMBER);
    const owner = await store.get_permission_keys(AppRole.TENANT_OWNER);
    const admin = await store.get_permission_keys(AppRole.PLATFORM_ADMIN);

    expect(member.has(PermissionKey.GAMES_READ)).toBe(true);
    expect(member.has(PermissionKey.SYNC_RUN)).toBe(false);
    expect(owner.has(PermissionKey.SYNC_RUN)).toBe(true);
    expect(owner.has(PermissionKey.PLATFORM_MANAGE)).toBe(false);
    expect(admin.has(PermissionKey.PLATFORM_MANAGE)).toBe(true);
    expect((await store.get_permission_keys('NOPE')).size).toBe(0);
  });

  it('only lets a role assume itself and roles below it', async () => {
    const slugs = async (role: string) =>
      (await store.get_assumable_roles(role)).map((assumable) => assumable.slug);

    expect(await slugs(AppRole.PLATFORM_ADMIN)).toEqual([
      AppRole.PLATFORM_ADMIN,
      AppRole.TENANT_OWNER,
      AppRole.TENANT_MEMBER,
    ]);
    expect(await slugs(AppRole.TENANT_OWNER)).toEqual([
      AppRole.TENANT_OWNER,
      AppRole.TENANT_MEMBER,
    ]);
    expect(await slugs(AppRole.TENANT_MEMBER)).toEqual([AppRole.TENANT_MEMBER]);
    expect(await slugs('NOPE')).toEqual([]);
  });

  it('refuses every mutation', async () => {
    await expect(store.create_role()).rejects.toThrow(/cannot be changed/);
    await expect(store.update_role_name()).rejects.toThrow(/cannot be changed/);
    await expect(store.delete_role()).rejects.toThrow(/cannot be changed/);
    await expect(store.replace_permission_keys()).rejects.toThrow(/cannot be changed/);
    await expect(store.replace_assumable_role_ids()).rejects.toThrow(/cannot be changed/);
  });

  it('works with core-server permission service', async () => {
    const service = create_role_permission_service({ store });

    expect(await service.role_has_permission(AppRole.TENANT_OWNER, PermissionKey.EMAIL_SEND)).toBe(
      true,
    );
    expect(await service.role_has_permission(AppRole.TENANT_MEMBER, PermissionKey.EMAIL_SEND)).toBe(
      false,
    );
    expect(await service.role_has_permission(null, PermissionKey.GAMES_READ)).toBe(false);
  });
});
