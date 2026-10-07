import { signal } from '@angular/core';
import { PermissionKey } from '../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../core/services/session/session.service';

/** The permissions of a tenant owner, as the API reports them. */
export const OWNER_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.CONNECTIONS_MANAGE,
  PermissionKey.GAMES_READ,
  PermissionKey.REPORTS_WRITE,
  PermissionKey.SYNC_RUN,
  PermissionKey.EMAIL_SEND,
  PermissionKey.QUICK_LINKS_MANAGE,
  PermissionKey.GAMES_RESPOND,
];

/** The permissions of a referee who may look but not manage connections. */
export const REFEREE_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.GAMES_READ,
  PermissionKey.GAMES_RESPOND,
  PermissionKey.REPORTS_WRITE,
];

/**
 * A stand-in for `SessionService` holding exactly the given permissions.
 * @param permissions Permission keys the user holds.
 * @param is_loading Whether the session is still loading.
 * @returns The double, with `is_loading` writable so a spec can flip it.
 */
export function make_session_service_double(
  permissions: readonly PermissionKey[],
  is_loading = false,
) {
  const loading = signal(is_loading);
  const granted = new Set<string>(permissions);
  const double = {
    is_loading: loading,
    permissions: signal<ReadonlySet<string>>(granted),
    has_permission: (key: PermissionKey) => granted.has(key),
  };
  return double satisfies Partial<Record<keyof SessionService, unknown>>;
}
