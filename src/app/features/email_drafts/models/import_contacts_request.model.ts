import { IImportContactEntry } from './import_contact_entry.model';

/** Body of the import contacts request. */
export interface IImportContactsRequest {
  /** At most 200 entries. */
  entries: IImportContactEntry[];
  /** Always true: the person importing confirms the contacts agreed to these emails. */
  consent_attested: true;
}
