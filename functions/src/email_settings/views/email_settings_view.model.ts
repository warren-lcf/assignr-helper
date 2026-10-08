/** A tenant's email settings as the API shows them. It never contains the API key. */
export interface IEmailSettingsView {
  /** True once an API key and sender address are saved. */
  configured: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  postal_address: string | null;
}
