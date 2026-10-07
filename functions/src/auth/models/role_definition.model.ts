import { AppRole } from '../enums/app_role.enum.js';
import { PermissionKey } from '../enums/permission_key.enum.js';

/** A system role: what it is allowed to do and which lower roles it may view as. */
export interface IRoleDefinition {
  role: AppRole;
  name: string;
  permissions: readonly PermissionKey[];
  /** Roles this role may assume with the effective-role header; never includes a higher role. */
  assumable: readonly AppRole[];
}
