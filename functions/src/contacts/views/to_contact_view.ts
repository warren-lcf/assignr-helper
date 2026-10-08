import { IStoredContact } from '../models/stored_contact.model.js';
import { IContactView } from './contact_view.model.js';

/**
 * Projects a stored contact to its API shape. The tenant id and audit actors are left out.
 * @param contact Stored contact.
 * @returns The view.
 */
export function to_contact_view(contact: IStoredContact): IContactView {
  return {
    contact_id: contact.contact_id,
    display_name: contact.display_name,
    email_address: contact.email_address,
    consent_status: contact.consent_status,
    consent_updated_at: contact.consent_updated_at,
    unsubscribed_at: contact.unsubscribed_at,
    created_at: contact.created_at,
  };
}
