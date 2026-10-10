-- My Schedule calendar feed: one subscription link per tenant, shown in a calendar app as a .ics feed.
-- Every statement is re-runnable. Times are INT64 UTC milliseconds. Comments must not contain semicolons.

-- One row per tenant. It keeps only the SHA-256 hash of the link's token, never the token.
-- Rotating the link replaces the hash in the same write and adds one to rotation_count.
-- Revoking the link deletes the row.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  tenant_id STRING(64) NOT NULL,
  token_hash STRING(64) NOT NULL,
  rotation_count INT64 NOT NULL,
  fetch_count INT64 NOT NULL,
  last_fetched_at INT64,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id);

-- The public feed URL carries only the token, so the tenant is found through its hash.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_feeds_by_token_hash
  ON calendar_feeds (token_hash);
