import { PermissionKey } from '../../../core/services/session/permission_key.enum';

export {
  make_session_service_double,
  type ISessionDoubleOptions,
} from '../../games/mocks/session_service.mock';

/** What a tenant owner holds, as the API reports it. */
export const OWNER_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.GAMES_READ,
  PermissionKey.CONNECTIONS_MANAGE,
  PermissionKey.QUICK_LINKS_MANAGE,
  PermissionKey.SYNC_RUN,
];

/** What a tenant member holds: no quick link management. */
export const MEMBER_PERMISSIONS: readonly PermissionKey[] = [
  PermissionKey.GAMES_READ,
  PermissionKey.REPORTS_WRITE,
];
