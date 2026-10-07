const MIGRATION_FILENAME_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/**
 * Extracts the four-digit version from a migration file name.
 * @param filename File name such as `0001_core_app_tables.sql`.
 * @returns The version, or null when the name does not follow the convention.
 */
export function parse_migration_filename(filename: string): string | null {
  const match = MIGRATION_FILENAME_PATTERN.exec(filename);
  return match ? match[1] : null;
}
