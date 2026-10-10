/** How `write_feed_token` treats a tenant that may or may not already have a feed. */
export enum FeedWriteMode {
  /** Create the feed or, when one exists, replace its token (what the library's `set_token` means). */
  UPSERT = 'UPSERT',
  /** Create the feed; refuse when one already exists. */
  CREATE_ONLY = 'CREATE_ONLY',
  /** Replace the token of an existing feed; refuse when there is none. */
  REPLACE_ONLY = 'REPLACE_ONLY',
}
