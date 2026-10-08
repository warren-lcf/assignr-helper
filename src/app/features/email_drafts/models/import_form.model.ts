/** The paste import dialog form value. */
export interface IImportFormModel {
  /** The pasted text: one Name and email in angle brackets, or a bare email, per line. */
  raw_text: string;
  /** True once the person has ticked the consent confirmation. */
  consent_attested: boolean;
}
