/** A migration file loaded from `functions/migrations`. */
export interface IMigrationFile {
  /** Four-digit version parsed from the file name. */
  version: string;
  filename: string;
  sql: string;
}
