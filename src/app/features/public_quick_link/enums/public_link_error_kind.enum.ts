/** Why the public page could not show games, as far as the page distinguishes. */
export enum PublicLinkErrorKind {
  /** The link is unknown, expired, revoked or malformed. Deliberately never told apart. */
  NOT_ACTIVE = 'NOT_ACTIVE',
  /** Too many requests from this visitor; try again after a pause. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Network trouble or a server error. */
  UNAVAILABLE = 'UNAVAILABLE',
}
