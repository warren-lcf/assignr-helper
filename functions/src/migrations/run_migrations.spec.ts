import { describe, expect, it } from 'vitest';
import { IMigrationFile } from './migration_file.model.js';
import { IMigrationStore } from './migration_store.interface.js';
import { run_migrations } from './run_migrations.js';

function make_store(applied: string[]) {
  const calls: string[] = [];
  const store: IMigrationStore = {
    ensure_bookkeeping: async () => {
      calls.push('ensure');
    },
    list_applied_versions: async () => applied,
    apply_statements: async (statements) => {
      calls.push(`apply:${statements.join('|')}`);
    },
    record_applied: async (version, filename, at) => {
      calls.push(`record:${version}:${filename}:${at}`);
    },
  };
  return { store, calls };
}

const file_a: IMigrationFile = {
  version: '0001',
  filename: '0001_a.sql',
  sql: 'CREATE TABLE a (x INT64) PRIMARY KEY (x);',
};
const file_b: IMigrationFile = {
  version: '0002',
  filename: '0002_b.sql',
  sql: 'CREATE TABLE b (x INT64) PRIMARY KEY (x);',
};

describe('run_migrations', () => {
  it('applies pending files in version order and records each', async () => {
    const { store, calls } = make_store([]);

    const result = await run_migrations(store, [file_b, file_a], () => 10);

    expect(result).toEqual(['0001', '0002']);
    expect(calls).toEqual([
      'ensure',
      'apply:CREATE TABLE a (x INT64) PRIMARY KEY (x)',
      'record:0001:0001_a.sql:10',
      'apply:CREATE TABLE b (x INT64) PRIMARY KEY (x)',
      'record:0002:0002_b.sql:10',
    ]);
  });

  it('skips versions already applied', async () => {
    const { store, calls } = make_store(['0001']);

    const result = await run_migrations(store, [file_a, file_b], () => 10);

    expect(result).toEqual(['0002']);
    expect(calls.some((call) => call.includes('0001_a.sql'))).toBe(false);
  });

  it('does nothing when everything is applied', async () => {
    const { store, calls } = make_store(['0001', '0002']);

    expect(await run_migrations(store, [file_a, file_b])).toEqual([]);
    expect(calls).toEqual(['ensure']);
  });
});
