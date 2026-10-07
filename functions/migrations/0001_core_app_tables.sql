-- Core app tables for the referee helper. Library tables (tenants, audit_log, outbox,
-- communications, share links) come from core-server hch-schema modules once installed.
-- Every statement is re-runnable. Times are INT64 UTC milliseconds. Calendar dates are
-- INT64 UTC-midnight milliseconds. Comments must not contain semicolons.

CREATE TABLE IF NOT EXISTS integration_connections (
  tenant_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  provider STRING(32) NOT NULL,
  status STRING(32) NOT NULL,
  account_label STRING(255),
  external_account_id STRING(128),
  secret_ref STRING(255),
  scopes_json STRING(MAX),
  last_sync_at INT64,
  last_error STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, connection_id);

CREATE TABLE IF NOT EXISTS organizations (
  tenant_id STRING(64) NOT NULL,
  organization_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  external_id STRING(128) NOT NULL,
  name STRING(255) NOT NULL,
  flags_json STRING(MAX),
  sync_enabled BOOL NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_by_external
  ON organizations (tenant_id, connection_id, external_id);

CREATE TABLE IF NOT EXISTS venues (
  tenant_id STRING(64) NOT NULL,
  venue_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  external_id STRING(128) NOT NULL,
  name STRING(255) NOT NULL,
  address_line STRING(255),
  city STRING(128),
  region STRING(64),
  postal_code STRING(32),
  latitude FLOAT64,
  longitude FLOAT64,
  time_zone STRING(64),
  location_group STRING(255),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, venue_id);

CREATE UNIQUE INDEX IF NOT EXISTS venues_by_external
  ON venues (tenant_id, connection_id, external_id);

CREATE TABLE IF NOT EXISTS games (
  tenant_id STRING(64) NOT NULL,
  game_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  organization_id STRING(64) NOT NULL,
  external_id STRING(128) NOT NULL,
  venue_id STRING(64),
  start_at INT64 NOT NULL,
  end_at INT64,
  game_time_zone STRING(64),
  local_date INT64,
  status STRING(32) NOT NULL,
  published BOOL NOT NULL,
  league STRING(255),
  age_group STRING(128),
  level STRING(128),
  game_type STRING(128),
  gender STRING(64),
  home_team STRING(255),
  away_team STRING(255),
  is_open BOOL NOT NULL,
  is_mine BOOL NOT NULL,
  external_updated_at INT64,
  lock_version INT64,
  last_seen_sync_run_id STRING(64),
  removed_at INT64,
  raw_json STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, game_id);

CREATE UNIQUE INDEX IF NOT EXISTS games_by_external
  ON games (tenant_id, connection_id, external_id);

CREATE INDEX IF NOT EXISTS games_by_open_start
  ON games (tenant_id, is_open, start_at);

CREATE INDEX IF NOT EXISTS games_by_venue_date
  ON games (tenant_id, venue_id, local_date, start_at);

CREATE TABLE IF NOT EXISTS game_slots (
  tenant_id STRING(64) NOT NULL,
  game_id STRING(64) NOT NULL,
  slot_id STRING(64) NOT NULL,
  position STRING(128) NOT NULL,
  assignee_name STRING(255),
  assignment_external_id STRING(128),
  response_status STRING(32) NOT NULL,
  is_mine BOOL NOT NULL,
  lock_version INT64,
  fees_json STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, game_id, slot_id),
  INTERLEAVE IN PARENT games ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS game_requests (
  tenant_id STRING(64) NOT NULL,
  request_id STRING(64) NOT NULL,
  game_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  external_id STRING(128),
  status STRING(32) NOT NULL,
  requested_at INT64 NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, request_id);

CREATE TABLE IF NOT EXISTS availability_blocks (
  tenant_id STRING(64) NOT NULL,
  block_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  external_id STRING(128),
  block_date INT64 NOT NULL,
  all_day BOOL NOT NULL,
  start_time STRING(8),
  end_time STRING(8),
  description STRING(512),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, block_id);

CREATE TABLE IF NOT EXISTS statements (
  tenant_id STRING(64) NOT NULL,
  statement_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  external_id STRING(128) NOT NULL,
  statement_date INT64,
  description STRING(512),
  status STRING(32),
  amount_minor INT64,
  amount_paid_minor INT64,
  currency STRING(8),
  raw_json STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, statement_id);

CREATE TABLE IF NOT EXISTS sync_runs (
  tenant_id STRING(64) NOT NULL,
  run_id STRING(64) NOT NULL,
  connection_id STRING(64) NOT NULL,
  kind STRING(32) NOT NULL,
  window_start INT64,
  window_end INT64,
  status STRING(32) NOT NULL,
  started_at INT64 NOT NULL,
  finished_at INT64,
  seen_count INT64,
  created_count INT64,
  updated_count INT64,
  removed_count INT64,
  rate_limit_remaining INT64,
  duration_ms INT64,
  error_json STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, run_id);

CREATE INDEX IF NOT EXISTS sync_runs_by_connection
  ON sync_runs (tenant_id, connection_id, started_at DESC);

CREATE TABLE IF NOT EXISTS contacts (
  tenant_id STRING(64) NOT NULL,
  contact_id STRING(64) NOT NULL,
  display_name STRING(255) NOT NULL,
  email_address STRING(320) NOT NULL,
  consent_status STRING(32) NOT NULL,
  consent_updated_at INT64,
  unsubscribed_at INT64,
  notes STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, contact_id);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_by_email
  ON contacts (tenant_id, email_address);

CREATE TABLE IF NOT EXISTS email_drafts (
  tenant_id STRING(64) NOT NULL,
  draft_id STRING(64) NOT NULL,
  subject STRING(512) NOT NULL,
  body_html STRING(MAX),
  status STRING(32) NOT NULL,
  filter_json STRING(MAX),
  quick_link_id STRING(64),
  recipient_count INT64,
  sent_at INT64,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, draft_id);

CREATE TABLE IF NOT EXISTS email_draft_games (
  tenant_id STRING(64) NOT NULL,
  draft_id STRING(64) NOT NULL,
  game_id STRING(64) NOT NULL,
  snapshot_json STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, draft_id, game_id),
  INTERLEAVE IN PARENT email_drafts ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS quick_links (
  tenant_id STRING(64) NOT NULL,
  link_id STRING(64) NOT NULL,
  token_hash STRING(64) NOT NULL,
  scope_json STRING(MAX) NOT NULL,
  expires_at INT64,
  revoked_at INT64,
  last_viewed_at INT64,
  view_count INT64 NOT NULL,
  email_draft_id STRING(64),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, link_id);

CREATE UNIQUE INDEX IF NOT EXISTS quick_links_by_token_hash
  ON quick_links (token_hash);

CREATE TABLE IF NOT EXISTS match_reports (
  tenant_id STRING(64) NOT NULL,
  report_id STRING(64) NOT NULL,
  game_id STRING(64) NOT NULL,
  status STRING(32) NOT NULL,
  home_score INT64,
  away_score INT64,
  notes STRING(MAX),
  client_revision INT64 NOT NULL,
  lock_version INT64 NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, report_id);

CREATE UNIQUE INDEX IF NOT EXISTS match_reports_by_game
  ON match_reports (tenant_id, game_id);

CREATE TABLE IF NOT EXISTS match_report_incidents (
  tenant_id STRING(64) NOT NULL,
  report_id STRING(64) NOT NULL,
  incident_id STRING(64) NOT NULL,
  team_side STRING(16) NOT NULL,
  jersey_number INT64,
  incident_type STRING(32) NOT NULL,
  minute INT64,
  reason_code STRING(64),
  idempotency_key STRING(64) NOT NULL,
  notes STRING(MAX),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, report_id, incident_id),
  INTERLEAVE IN PARENT match_reports ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS match_report_incidents_by_idempotency
  ON match_report_incidents (tenant_id, idempotency_key);
