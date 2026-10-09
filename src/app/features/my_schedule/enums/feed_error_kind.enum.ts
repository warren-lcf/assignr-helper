/** What went wrong with a calendar feed request, in the terms the screen reacts to. */
export enum FeedErrorKind {
  /** A platform administrator has not picked a tenant to act in. */
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  /** The role may not manage the calendar link. */
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  /** A feed already exists, so another cannot be created. */
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  /** There is no feed to rotate. */
  NOT_FOUND = 'NOT_FOUND',
  /** Anything else; may pass on a second try. */
  GENERIC = 'GENERIC',
}
