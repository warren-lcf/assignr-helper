import { ConsentStatus } from '../enums/consent_status.enum';
import { IEmailContact } from '../models/email_contact.model';

/**
 * Builds a contact fixture.
 * @param overrides Fields to change from a consenting contact.
 * @returns The contact.
 */
export function make_email_contact(overrides: Partial<IEmailContact> = {}): IEmailContact {
  return {
    contact_id: 'contact-1',
    display_name: 'Alice Archer',
    email_address: 'alice@example.test',
    consent_status: ConsentStatus.GRANTED,
    consent_updated_at: Date.UTC(2026, 8, 1, 10, 0, 0),
    unsubscribed_at: null,
    created_at: Date.UTC(2026, 8, 1, 10, 0, 0),
    ...overrides,
  };
}

/** A consenting contact. */
export const ALICE: IEmailContact = make_email_contact();

/** Another consenting contact. */
export const BOB: IEmailContact = make_email_contact({
  contact_id: 'contact-2',
  display_name: 'Bob Baker',
  email_address: 'bob@example.test',
});

/** A contact who used the unsubscribe link. */
export const CAROL_UNSUBSCRIBED: IEmailContact = make_email_contact({
  contact_id: 'contact-3',
  display_name: 'Carol Cruz',
  email_address: 'carol@example.test',
  consent_status: ConsentStatus.UNSUBSCRIBED,
  consent_updated_at: Date.UTC(2026, 9, 2, 9, 0, 0),
  unsubscribed_at: Date.UTC(2026, 9, 2, 9, 0, 0),
});

/** Two consenting contacts and one who unsubscribed. */
export const CONTACT_FIXTURES: readonly IEmailContact[] = [ALICE, BOB, CAROL_UNSUBSCRIBED];
