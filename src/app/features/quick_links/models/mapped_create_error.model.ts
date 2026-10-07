/** A failed create call translated for the dialog. */
export interface IMappedCreateError {
  /** Messages for form fields, keyed by the form field's name. */
  field_errors: Partial<Record<'levels' | 'date_start' | 'date_end' | 'expiry', string>>;
  /** A problem that belongs to the form as a whole, or null when there is none. */
  form_error: string | null;
}
