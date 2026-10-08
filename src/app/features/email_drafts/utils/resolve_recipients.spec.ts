import { ConsentStatus } from '../enums/consent_status.enum';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { ALICE, BOB, CAROL_UNSUBSCRIBED } from '../mocks/email_contact.mock';
import { resolve_recipients } from './resolve_recipients';

describe('resolve_recipients', () => {
  const contacts = [ALICE, CAROL_UNSUBSCRIBED, BOB];

  it('returns every consenting contact for the all-consented mode', () => {
    expect(resolve_recipients(contacts, RecipientMode.ALL_CONSENTED, [])).toEqual([ALICE, BOB]);
  });

  it('returns only the chosen consenting contacts for the selected mode', () => {
    expect(resolve_recipients(contacts, RecipientMode.SELECTED, [BOB.contact_id])).toEqual([BOB]);
  });

  it('never returns an unsubscribed contact, even when chosen', () => {
    const result = resolve_recipients(contacts, RecipientMode.SELECTED, [
      CAROL_UNSUBSCRIBED.contact_id,
      ALICE.contact_id,
    ]);

    expect(result).toEqual([ALICE]);
    expect(result.every((contact) => contact.consent_status === ConsentStatus.GRANTED)).toBe(true);
  });

  it('returns nobody when none are chosen', () => {
    expect(resolve_recipients(contacts, RecipientMode.SELECTED, [])).toEqual([]);
  });
});
