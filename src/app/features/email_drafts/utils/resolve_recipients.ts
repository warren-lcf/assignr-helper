import { ConsentStatus } from '../enums/consent_status.enum';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { IEmailContact } from '../models/email_contact.model';

/**
 * The contacts a draft would email, as far as this screen can tell: those who
 * agreed and have not unsubscribed, and for a chosen-people draft only the
 * ones chosen. The server count in the preview is what counts; this list only
 * names people.
 * @param contacts All contacts.
 * @param mode Who the draft goes to.
 * @param contact_ids The chosen contacts' ids (used for the SELECTED mode).
 * @returns The contacts that would be emailed, in list order.
 */
export function resolve_recipients(
  contacts: readonly IEmailContact[],
  mode: RecipientMode,
  contact_ids: readonly string[],
): IEmailContact[] {
  const chosen = new Set(contact_ids);
  return contacts.filter(
    (contact) =>
      contact.consent_status === ConsentStatus.GRANTED &&
      (mode === RecipientMode.ALL_CONSENTED || chosen.has(contact.contact_id)),
  );
}
