/** Body of the save settings request. */
export interface ISaveEmailSettingsRequest {
  /** The SendGrid API key. Required the first time; leave out to keep the stored one. Write-only. */
  api_key?: string;
  from_email: string;
  from_name?: string | null;
  reply_to?: string | null;
  postal_address?: string | null;
}
