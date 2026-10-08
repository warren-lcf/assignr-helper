/** A failed email API call translated for a dialog or screen. */
export interface IMappedEmailError {
  /** The API error code when the body had one, otherwise null. */
  code: string | null;
  /** Messages for form fields, keyed by the request field name. */
  field_errors: Record<string, string>;
  /** A problem that belongs to the form as a whole, or null when there is none. */
  form_error: string | null;
}
