import { CONTACT_LIMITS } from '../contacts/contact_limits.constant.js';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { IStoredContact } from '../contacts/models/stored_contact.model.js';
import { IContactStore } from '../contacts/ports/contact_store.interface.js';
import { RecipientMode } from './enums/recipient_mode.enum.js';
import { IDraftContent } from './models/draft_content.model.js';
import { IResolvedRecipients } from './models/resolved_recipients.model.js';

/**
 * Orders contacts by display name ignoring case, then by id.
 * @param a First contact.
 * @param b Second contact.
 * @returns Negative, zero or positive ordering value.
 */
function compare_contacts(a: IStoredContact, b: IStoredContact): number {
  const a_name = a.display_name.toLowerCase();
  const b_name = b.display_name.toLowerCase();
  if (a_name !== b_name) {
    return a_name < b_name ? -1 : 1;
  }
  if (a.contact_id === b.contact_id) {
    return 0;
  }
  return a.contact_id < b.contact_id ? -1 : 1;
}

/**
 * Works out who a draft would be emailed, from the contacts as they are right now. Only contacts
 * whose consent is granted are ever eligible: an unsubscribed contact is never returned in
 * `eligible`, whichever mode the draft uses and however the contact was chosen.
 */
export class RecipientResolver {
  /**
   * Creates the resolver.
   * @param contacts Contact store.
   */
  public constructor(private readonly contacts: IContactStore) {}

  /**
   * Resolves a draft's recipients.
   * @param tenant_id Owning tenant; no other tenant's contact is ever read.
   * @param draft The draft's recipient choice.
   * @returns Who is eligible and what was left out.
   */
  public async resolve(
    tenant_id: string,
    draft: Pick<IDraftContent, 'recipient_mode' | 'contact_ids'>,
  ): Promise<IResolvedRecipients> {
    if (draft.recipient_mode === RecipientMode.SELECTED) {
      const found = await this.contacts.find_contacts(tenant_id, draft.contact_ids);
      const eligible = found.filter((c) => c.consent_status === ConsentStatus.GRANTED);
      const skipped = found.filter((c) => c.consent_status !== ConsentStatus.GRANTED);
      return {
        eligible: eligible.sort(compare_contacts),
        skipped_unsubscribed: skipped.sort(compare_contacts),
        unsubscribed_count: skipped.length,
        missing_count: new Set(draft.contact_ids).size - found.length,
      };
    }
    const [granted, unsubscribed] = await Promise.all([
      this.contacts.list_contacts(tenant_id, {
        consent_status: ConsentStatus.GRANTED,
        limit: CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT,
      }),
      this.contacts.list_contacts(tenant_id, {
        consent_status: ConsentStatus.UNSUBSCRIBED,
        limit: CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT,
      }),
    ]);
    return {
      eligible: granted.sort(compare_contacts),
      skipped_unsubscribed: [],
      unsubscribed_count: unsubscribed.length,
      missing_count: 0,
    };
  }
}
