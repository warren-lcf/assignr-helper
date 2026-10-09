/** Optional settings of the calendar feed stores. */
export interface ICalendarFeedStoreOptions {
  /** Clock returning the current instant in UTC milliseconds; defaults to `Date.now`. */
  now?: () => number;
}
