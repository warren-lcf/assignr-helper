/** A row the server refused during an import. */
export interface IImportInvalidRow {
  /** Position of the row in the request, as the server counts it. */
  row: number;
  /** The server reason. Plain text; shown escaped. */
  reason: string;
}
