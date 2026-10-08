import { IImportContactEntry } from './import_contact_entry.model';

/** One pasted line that became a contact entry. */
export interface IParsedContactLine {
  /** Line number in the pasted text, starting at 1 (blank lines count). */
  row: number;
  entry: IImportContactEntry;
}
