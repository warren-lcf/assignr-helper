import { ConsentStatus } from '../enums/consent_status.enum';

/** One person who can receive the emails, as the contacts API reports them. */
export interface IEmailContact {
  contact_id: string;
  display_name: string;
  email_address: string;
  consent_status: ConsentStatus;
  /** UTC milliseconds the consent last changed, or null. */
  consent_updated_at: number | null;
  /** UTC milliseconds the contact unsubscribed, or null. */
  unsubscribed_at: number | null;
  created_at: number;
}
