import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse_migration_filename } from './parse_migration_filename.js';
import { split_statements } from './split_statements.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const FILES = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));

describe('the migration files on disk', () => {
  it('all follow the naming convention with unique versions', () => {
    const versions = FILES.map((name) => parse_migration_filename(name));

    expect(versions.every((version) => version !== null)).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it.each(FILES)('%s only holds re-runnable DDL without semicolons in comments', (name) => {
    const text = readFileSync(`${MIGRATIONS_DIR}${name}`, 'utf8');
    const comment_lines = text.split(/\r?\n/).filter((line) => line.trim().startsWith('--'));
    const statements = split_statements(text);

    expect(comment_lines.every((line) => !line.includes(';'))).toBe(true);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE TABLE IF NOT EXISTS |CREATE (UNIQUE )?INDEX IF NOT EXISTS |ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS )/,
      );
    }
  });
});

describe('0005_email_deliveries.sql', () => {
  const statements = split_statements(
    readFileSync(`${MIGRATIONS_DIR}0005_email_deliveries.sql`, 'utf8'),
  );
  const recipients = statements.find((s) => s.includes('email_draft_recipients')) ?? '';
  const suppressions = statements.find((s) => s.includes('email_suppressions')) ?? '';

  it('records each recipient under its draft and removes them with it', () => {
    expect(recipients).toContain('PRIMARY KEY (tenant_id, draft_id, contact_id)');
    expect(recipients).toContain('INTERLEAVE IN PARENT email_drafts ON DELETE CASCADE');
    expect(recipients).toContain('tenant_id STRING(64) NOT NULL');
  });

  it('carries the audit columns on both tables', () => {
    for (const table of [recipients, suppressions]) {
      for (const column of ['created_at', 'created_by', 'updated_at', 'updated_by']) {
        expect(table).toContain(column);
      }
    }
  });

  it('keeps no email address: recipients hold a contact id, suppressions a hash', () => {
    expect(recipients).not.toMatch(/address/i);
    expect(recipients).toContain('contact_id STRING(64) NOT NULL');
    expect(suppressions).toContain('email_hash STRING(64)');
    expect(suppressions).not.toMatch(/email_address/);
  });

  it('keys suppressions by tenant and hash', () => {
    expect(suppressions).toContain('PRIMARY KEY (tenant_id, email_hash)');
  });
});

describe('0006_calendar_feeds.sql', () => {
  const statements = split_statements(
    readFileSync(`${MIGRATIONS_DIR}0006_calendar_feeds.sql`, 'utf8'),
  );
  const table =
    statements.find((s) => s.includes('CREATE TABLE IF NOT EXISTS calendar_feeds')) ?? '';
  const index = statements.find((s) => s.includes('calendar_feeds_by_token_hash')) ?? '';

  it('holds one feed per tenant', () => {
    expect(table).toContain('tenant_id STRING(64) NOT NULL');
    expect(table).toContain('PRIMARY KEY (tenant_id)');
  });

  it('stores the token hash and counters, never a token', () => {
    expect(table).toContain('token_hash STRING(64) NOT NULL');
    expect(table).toContain('rotation_count INT64 NOT NULL');
    expect(table).toContain('fetch_count INT64 NOT NULL');
    expect(table).toContain('last_fetched_at INT64,');
    expect(table).not.toMatch(/\btoken\s+STRING/);
  });

  it('carries the audit columns', () => {
    for (const column of ['created_at', 'created_by', 'updated_at', 'updated_by']) {
      expect(table).toContain(column);
    }
  });

  it('finds a feed by its token hash through a unique index', () => {
    expect(index).toMatch(/^CREATE UNIQUE INDEX IF NOT EXISTS calendar_feeds_by_token_hash/);
    expect(index).toContain('ON calendar_feeds (token_hash)');
  });
});
