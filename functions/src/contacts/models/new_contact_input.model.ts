/** A validated request to add one contact. */
export interface INewContactInput {
  display_name: string;
  /** Already trimmed and lower-cased. */
  email_address: string;
}
