import { signal } from '@angular/core';
import { PermissionKey } from '../../../core/services/session/permission_key.enum';
import { ISessionContext } from '../../../core/services/session/session_context.model';
import { SessionService } from '../../../core/services/session/session.service';

/** The permissions of a referee, as the API reports them. */
export const REFEREE_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.GAMES_READ,
  PermissionKey.GAMES_RESPOND,
  PermissionKey.REPORTS_WRITE,
];

/** A role that can read games but not write reports. */
export const READ_ONLY_PERMISSIONS: readonly PermissionKey[] = [PermissionKey.GAMES_READ];

/** A role that can write reports but not read games. */
export const WRITE_ONLY_PERMISSIONS: readonly PermissionKey[] = [PermissionKey.REPORTS_WRITE];

/** The context `/api/me` reports once loaded. */
const SESSION_CONTEXT: ISessionContext = {
  uid: 'u1',
  email: 'ref@example.com',
  tenant_id: 'tenant-1',
  role: 'REFEREE',
  actual_tenant_id: 'tenant-1',
  actual_role: 'REFEREE',
  permissions: [],
};

/** Options for {@link make_session_service_double}. */
export interface ISessionDoubleOptions {
  /** Whether the session is still loading. */
  is_loading?: boolean;
  /** Whether loading the session failed. */
  has_failed?: boolean;
}

/**
 * A stand-in for `SessionService` holding exactly the given permissions.
 * @param permissions Permission keys the user holds.
 * @param options Loading and failure flags.
 * @returns The double, with a count of how often it was reloaded.
 */
export function make_session_service_double(
  permissions: readonly PermissionKey[],
  options: ISessionDoubleOptions = {},
) {
  // Like the real service: until the session has loaded, or after it failed, nothing is granted.
  const granted = new Set<string>(options.is_loading || options.has_failed ? [] : permissions);
  const reload_count = signal(0);
  const double = {
    context: signal<ISessionContext | null>(
      options.has_failed || options.is_loading ? null : SESSION_CONTEXT,
    ),
    is_loading: signal(options.is_loading ?? false),
    has_failed: signal(options.has_failed ?? false),
    permissions: signal<ReadonlySet<string>>(granted),
    has_permission: (key: PermissionKey) => granted.has(key),
    reload_count,
    reload: () => reload_count.update((count) => count + 1),
  };
  return double satisfies Partial<Record<keyof SessionService, unknown>>;
}
