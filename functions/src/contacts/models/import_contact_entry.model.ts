/** One row of an import, as typed by the owner. Nothing in it has been checked yet. */
export interface IImportContactEntry {
  display_name?: string | null;
  email_address: string;
}
