import { ConsentStatus } from '../enums/consent_status.enum.js';

/** A contact as the owner's API shows it. */
export interface IContactView {
  contact_id: string;
  display_name: string;
  email_address: string;
  consent_status: ConsentStatus;
  consent_updated_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
}
