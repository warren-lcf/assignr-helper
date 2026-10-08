import { ALICE, BOB, CAROL_UNSUBSCRIBED } from '../mocks/email_contact.mock';
import { filter_contacts } from './filter_contacts';

describe('filter_contacts', () => {
  const contacts = [ALICE, BOB, CAROL_UNSUBSCRIBED];

  it('keeps everyone for a blank search', () => {
    expect(filter_contacts(contacts, '   ')).toEqual(contacts);
  });

  it('matches names ignoring case', () => {
    expect(filter_contacts(contacts, 'ALI')).toEqual([ALICE]);
  });

  it('matches addresses', () => {
    expect(filter_contacts(contacts, 'bob@')).toEqual([BOB]);
  });

  it('returns nobody when nothing matches', () => {
    expect(filter_contacts(contacts, 'zzz')).toEqual([]);
  });
});
