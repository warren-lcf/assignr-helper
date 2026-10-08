import { IImportInvalidRow } from './import_invalid_row.model';

/** The payload of the import contacts request. */
export interface IImportContactsResult {
  added: number;
  skipped_existing: number;
  invalid: IImportInvalidRow[];
}
