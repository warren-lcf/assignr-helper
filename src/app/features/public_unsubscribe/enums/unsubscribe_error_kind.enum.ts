/** Why the unsubscribe page could not do its job, as far as the page distinguishes. */
export enum UnsubscribeErrorKind {
  /** The link is unknown, expired or malformed. Deliberately never told apart. */
  NOT_VALID = 'NOT_VALID',
  /** Too many requests from this visitor; try again after a pause. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Network trouble or a server error. */
  UNAVAILABLE = 'UNAVAILABLE',
}
