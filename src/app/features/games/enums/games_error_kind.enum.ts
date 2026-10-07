/** Why the games list could not be shown, as far as the screen distinguishes. */
export enum GamesErrorKind {
  /** A platform administrator has not picked a tenant to act in. */
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  /** The backend refused the current filters. */
  INVALID_FILTERS = 'INVALID_FILTERS',
  /** The effective role may not read games. */
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  /** Anything else: network trouble, a server error. */
  GENERIC = 'GENERIC',
}
