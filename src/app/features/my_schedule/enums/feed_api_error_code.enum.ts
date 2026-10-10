/** Machine-readable reasons the calendar feed endpoints refuse a request. Mirrors the backend. */
export enum FeedApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  /** Creating a feed when the person already has one. */
  FEED_EXISTS = 'FEED_EXISTS',
}
