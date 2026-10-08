/** A row of an import that was not added because it is not acceptable. */
export interface IImportRowProblem {
  /** 1-based position of the row in the request. */
  row: number;
  /** Why the row was refused. Never contains the address. */
  reason: string;
}

/** What an import of contacts did. */
export interface IImportContactsResult {
  /** Contacts newly added. */
  added: number;
  /** Rows whose address the tenant already has (or listed twice, or opted out earlier). */
  skipped_existing: number;
  /** Rows that were refused, with the reason. */
  invalid: IImportRowProblem[];
}
