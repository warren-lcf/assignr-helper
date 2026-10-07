-- Tenants and who belongs to them. A platform administrator is a member of the single
-- PLATFORM tenant. Roles are fixed in code, so no roles table exists. Re-runnable.

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id STRING(64) NOT NULL,
  name STRING(255) NOT NULL,
  tenant_type STRING(32) NOT NULL,
  status STRING(32) NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id);

CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id STRING(64) NOT NULL,
  user_id STRING(128) NOT NULL,
  role_slug STRING(64) NOT NULL,
  status STRING(32) NOT NULL,
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  updated_at INT64 NOT NULL,
  updated_by STRING(128) NOT NULL
) PRIMARY KEY (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS tenant_members_by_user
  ON tenant_members (user_id, status);
