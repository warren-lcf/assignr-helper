import { IEmailContact } from '../models/email_contact.model';

/**
 * Narrows contacts to those whose name or address contains the search text
 * (ignoring case and surrounding spaces). A blank search keeps everyone.
 * @param contacts The contacts.
 * @param search What the user typed.
 * @returns The matching contacts, in their original order.
 */
export function filter_contacts(
  contacts: readonly IEmailContact[],
  search: string,
): IEmailContact[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [...contacts];
  return contacts.filter(
    (contact) =>
      contact.display_name.toLowerCase().includes(needle) ||
      contact.email_address.toLowerCase().includes(needle),
  );
}
