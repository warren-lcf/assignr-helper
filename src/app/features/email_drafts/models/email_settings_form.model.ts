/** The sender settings dialog form value (everything except the write-only API key). */
export interface IEmailSettingsFormModel {
  from_email: string;
  from_name: string;
  reply_to: string;
  postal_address: string;
}
