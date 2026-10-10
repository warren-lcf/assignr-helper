/** Where the calendar feed stands. Mirrors the backend; a feed that is revoked simply no longer exists. */
export enum FeedStatus {
  /** The feed works: a calendar app that holds its link can read the schedule. */
  ACTIVE = 'ACTIVE',
}
