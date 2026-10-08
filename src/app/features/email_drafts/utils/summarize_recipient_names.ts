import { IEmailContact } from '../models/email_contact.model';

/** The first few names of a recipient list and how many are left out. */
export interface IRecipientNameSummary {
  names: string[];
  more: number;
}

/**
 * Names the first few recipients for the send confirmation. Only display
 * names are used, never addresses.
 * @param recipients The recipients.
 * @param limit How many names to list.
 * @returns The names and the number of recipients not named.
 */
export function summarize_recipient_names(
  recipients: readonly IEmailContact[],
  limit: number,
): IRecipientNameSummary {
  const names = recipients.slice(0, limit).map((contact) => contact.display_name);
  return { names, more: Math.max(0, recipients.length - names.length) };
}
