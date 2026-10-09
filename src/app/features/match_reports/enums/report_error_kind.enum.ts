/** Why the report list or a report could not be shown, as far as the screens distinguish. */
export enum ReportErrorKind {
  /** A platform administrator has not picked a tenant to act in. */
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  /** The effective role may not use reports. */
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  /** The game is cancelled, so no report can be started. */
  GAME_CANCELLED = 'GAME_CANCELLED',
  /** The game is not one of the referee's, or does not exist. */
  NOT_FOUND = 'NOT_FOUND',
  /** Anything else: network trouble, a server error. */
  GENERIC = 'GENERIC',
}
