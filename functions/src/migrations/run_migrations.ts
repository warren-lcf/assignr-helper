import { IMigrationFile } from './migration_file.model.js';
import { IMigrationStore } from './migration_store.interface.js';
import { split_statements } from './split_statements.js';

/**
 * Applies every migration whose version is not yet recorded, in version order.
 * Applied files are never re-run or edited; gaps in numbering are allowed.
 * @param store Persistence port.
 * @param files Migration files available on disk.
 * @param now Clock returning UTC milliseconds.
 * @returns Versions applied during this run, in order.
 */
export async function run_migrations(
  store: IMigrationStore,
  files: IMigrationFile[],
  now: () => number = Date.now,
): Promise<string[]> {
  await store.ensure_bookkeeping();
  const applied = new Set(await store.list_applied_versions());
  const pending = files
    .filter((file) => !applied.has(file.version))
    .sort((left, right) => left.version.localeCompare(right.version));

  const applied_now: string[] = [];
  for (const file of pending) {
    await store.apply_statements(split_statements(file.sql));
    await store.record_applied(file.version, file.filename, now());
    applied_now.push(file.version);
  }
  return applied_now;
}
