/** An API failure translated for the screen: messages for fields plus one for the form as a whole. */
export interface IMappedApiError {
  /** User-facing message per request field (`client_id`, `client_secret`, ...). */
  field_errors: Record<string, string>;
  /** User-facing message that belongs to no single field, or null. */
  form_error: string | null;
}
