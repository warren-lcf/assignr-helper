-- Email sending: who each draft was sent to, and the addresses that must never be mailed again.
-- Every statement is re-runnable. Times are INT64 UTC milliseconds. Comments must not contain semicolons.

-- One row per contact a draft was attempted for. It stores the contact id only, never the address.
-- A SENT row is final and is never overwritten, so a retry of a partly sent draft skips it.
CREATE TABLE IF NOT EXISTS email_draft_recipients (
  tenant_id STRING(64) NOT NULL,
  draft_id STRING(64) NOT NULL,
  contact_id STRING(64) NOT NULL,
  status STRING(32) NOT NULL,
  provider_message_id STRING(255),
  error_code STRING(64),
  sent_at INT64,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, draft_id, contact_id),
  INTERLEAVE IN PARENT email_drafts ON DELETE CASCADE;

-- Addresses that unsubscribed and were then deleted. Only a SHA-256 hash of the lower-cased address
-- is kept, so adding the same address again can be refused without storing the address.
CREATE TABLE IF NOT EXISTS email_suppressions (
  tenant_id STRING(64) NOT NULL,
  email_hash STRING(64) NOT NULL,
  unsubscribed_at INT64 NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, email_hash);
