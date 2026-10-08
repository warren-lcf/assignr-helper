import { IStoredContact } from '../../contacts/models/stored_contact.model.js';

/** Who a draft would be emailed right now. */
export interface IResolvedRecipients {
  /** Contacts who can be emailed, ordered by display name (ignoring case), then id. */
  eligible: IStoredContact[];
  /** Chosen contacts who have unsubscribed, so are skipped. Always empty for ALL_CONSENTED. */
  skipped_unsubscribed: IStoredContact[];
  /**
   * How many unsubscribed contacts are left out: the chosen ones for SELECTED, every unsubscribed
   * contact of the tenant for ALL_CONSENTED.
   */
  unsubscribed_count: number;
  /** Chosen contacts that no longer exist. Always 0 for ALL_CONSENTED. */
  missing_count: number;
}
