import { Database } from '@google-cloud/spanner';
import { IMigrationStore } from './migration_store.interface.js';

/** Spanner limits how many statements a schema update may validate at once. */
const DDL_BATCH_SIZE = 5;

/** Spanner implementation of the migration persistence port. */
export class SpannerMigrationStore implements IMigrationStore {
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async ensure_bookkeeping(): Promise<void> {
    await this.apply_statements([
      'CREATE TABLE IF NOT EXISTS schema_migrations (version STRING(4) NOT NULL, filename STRING(255) NOT NULL, applied_at_utc_ms INT64 NOT NULL) PRIMARY KEY (version)',
    ]);
  }

  /** @inheritdoc */
  public async list_applied_versions(): Promise<string[]> {
    const [rows] = await this.database.run({
      sql: 'SELECT version FROM schema_migrations',
      json: true,
    });
    return (rows as { version: string }[]).map((row) => row.version);
  }

  /** @inheritdoc */
  public async apply_statements(statements: string[]): Promise<void> {
    for (let index = 0; index < statements.length; index += DDL_BATCH_SIZE) {
      const [operation] = await this.database.updateSchema(
        statements.slice(index, index + DDL_BATCH_SIZE),
      );
      await operation.promise();
    }
  }

  /** @inheritdoc */
  public async record_applied(
    version: string,
    filename: string,
    applied_at: number,
  ): Promise<void> {
    await this.database.table('schema_migrations').insert({
      version,
      filename,
      applied_at_utc_ms: applied_at,
    });
  }
}
