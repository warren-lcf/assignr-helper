-- The append-only audit trail, taken verbatim from core-server's audit schema module (hch-schema render audit, version 1).
-- Re-runnable.

CREATE TABLE IF NOT EXISTS audit_log (
  audit_log_id STRING(64) NOT NULL,
  user_id STRING(128) NOT NULL,
  tenant_id STRING(64),
  resource_type STRING(128) NOT NULL,
  resource_id STRING(256) NOT NULL,
  action STRING(32) NOT NULL,
  before_state_json STRING(MAX),
  after_state_json STRING(MAX),
  actual_role STRING(64),
  effective_role STRING(64),
  created_at INT64 NOT NULL,
  created_by STRING(128) NOT NULL,
  actor_name STRING(256),
  trace_correlation_id STRING(128),
  client_ip_address STRING(64),
  state_omission_reason STRING(512)
) PRIMARY KEY (audit_log_id);

CREATE INDEX IF NOT EXISTS audit_log_by_tenant_time ON audit_log (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS audit_log_by_resource ON audit_log (tenant_id, resource_type, resource_id, created_at);
