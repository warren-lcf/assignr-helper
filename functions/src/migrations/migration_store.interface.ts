/** Persistence port the migration runner drives; implemented over Spanner. */
export interface IMigrationStore {
  /**
   * Ensures the bookkeeping table exists.
   * @returns Resolves once `schema_migrations` is available.
   */
  ensure_bookkeeping(): Promise<void>;

  /**
   * Lists migration versions already applied.
   * @returns Applied four-digit versions.
   */
  list_applied_versions(): Promise<string[]>;

  /**
   * Applies DDL statements in order, batched to respect Spanner's limits.
   * @param statements DDL statements without trailing semicolons.
   * @returns Resolves when every statement has been applied.
   */
  apply_statements(statements: string[]): Promise<void>;

  /**
   * Records a migration as applied.
   * @param version Four-digit version.
   * @param filename Source file name.
   * @param applied_at UTC milliseconds.
   * @returns Resolves once recorded.
   */
  record_applied(version: string, filename: string, applied_at: number): Promise<void>;
}
