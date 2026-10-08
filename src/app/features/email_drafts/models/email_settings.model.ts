/** The tenant sender (SendGrid) settings as the settings API reports them. The API key is never part of it. */
export interface IEmailSettings {
  /** Whether sending is set up (an API key and sender address are stored). */
  configured: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  postal_address: string | null;
}
