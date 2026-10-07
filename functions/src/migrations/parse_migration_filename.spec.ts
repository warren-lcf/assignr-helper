import { describe, expect, it } from 'vitest';
import { parse_migration_filename } from './parse_migration_filename.js';

describe('parse_migration_filename', () => {
  it('returns the version for a conforming name', () => {
    expect(parse_migration_filename('0001_core_app_tables.sql')).toBe('0001');
  });

  it.each(['1_short.sql', '0001-core.sql', '0001_Core.sql', '0001_core.mjs', 'README.md'])(
    'rejects %s',
    (name) => {
      expect(parse_migration_filename(name)).toBeNull();
    },
  );
});
