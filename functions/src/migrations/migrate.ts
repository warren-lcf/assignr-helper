import { Spanner } from '@google-cloud/spanner';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMigrationFile } from './migration_file.model.js';
import { parse_migration_filename } from './parse_migration_filename.js';
import { run_migrations } from './run_migrations.js';
import { SpannerMigrationStore } from './spanner_migration_store.js';

/**
 * Reads a required environment variable, failing closed when it is missing.
 * @param name Variable name.
 * @returns The non-empty value.
 */
function require_env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Entry point: applies pending migrations to the configured Spanner database.
 * Against real Spanner it also requires `CONFIRM_PRODUCTION_MIGRATION=true`.
 * @returns Resolves when migrations finish.
 */
async function main(): Promise<void> {
  const is_emulator = Boolean(process.env['SPANNER_EMULATOR_HOST']);
  if (!is_emulator && process.env['CONFIRM_PRODUCTION_MIGRATION'] !== 'true') {
    throw new Error('Refusing to migrate real Spanner without CONFIRM_PRODUCTION_MIGRATION=true');
  }

  const spanner = new Spanner({ projectId: require_env('SPANNER_PROJECT_ID') });
  const database = spanner
    .instance(require_env('SPANNER_INSTANCE_ID'))
    .database(require_env('SPANNER_DATABASE_ID'));

  const directory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
  const files: IMigrationFile[] = [];
  for (const filename of (await readdir(directory)).sort()) {
    const version = parse_migration_filename(filename);
    if (version) {
      files.push({ version, filename, sql: await readFile(join(directory, filename), 'utf8') });
    }
  }

  const applied = await run_migrations(new SpannerMigrationStore(database), files);
  console.log(
    applied.length ? `Applied migrations: ${applied.join(', ')}` : 'No pending migrations',
  );
  await database.close();
}

main().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exitCode = 1;
});
