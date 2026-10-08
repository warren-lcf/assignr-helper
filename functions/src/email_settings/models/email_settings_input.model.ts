/** A validated request to save email settings. */
export interface IEmailSettingsInput {
  /** New API key; null keeps the stored one. */
  api_key: string | null;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  postal_address: string | null;
}
