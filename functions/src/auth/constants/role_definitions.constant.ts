import { AppRole } from '../enums/app_role.enum.js';
import { PermissionKey } from '../enums/permission_key.enum.js';
import { IRoleDefinition } from '../models/role_definition.model.js';

const MEMBER_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.GAMES_READ,
  PermissionKey.REPORTS_WRITE,
];

const OWNER_PERMISSIONS: readonly PermissionKey[] = [
  ...MEMBER_PERMISSIONS,
  PermissionKey.GAMES_RESPOND,
  PermissionKey.CONNECTIONS_MANAGE,
  PermissionKey.SYNC_RUN,
  PermissionKey.EMAIL_SEND,
  PermissionKey.QUICK_LINKS_MANAGE,
];

/**
 * The system roles. A role may assume only roles below it, so a "view as" can
 * only ever remove access, never add it.
 */
export const ROLE_DEFINITIONS: readonly IRoleDefinition[] = [
  {
    role: AppRole.PLATFORM_ADMIN,
    name: 'Platform administrator',
    permissions: [...OWNER_PERMISSIONS, PermissionKey.PLATFORM_MANAGE],
    assumable: [AppRole.TENANT_OWNER, AppRole.TENANT_MEMBER],
  },
  {
    role: AppRole.TENANT_OWNER,
    name: 'Tenant owner',
    permissions: OWNER_PERMISSIONS,
    assumable: [AppRole.TENANT_MEMBER],
  },
  {
    role: AppRole.TENANT_MEMBER,
    name: 'Tenant member',
    permissions: MEMBER_PERMISSIONS,
    assumable: [],
  },
];
