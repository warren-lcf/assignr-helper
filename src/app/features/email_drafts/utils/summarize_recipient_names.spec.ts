import { ALICE, BOB } from '../mocks/email_contact.mock';
import { summarize_recipient_names } from './summarize_recipient_names';

describe('summarize_recipient_names', () => {
  it('lists the first names and counts the rest', () => {
    expect(summarize_recipient_names([ALICE, BOB], 1)).toEqual({
      names: [ALICE.display_name],
      more: 1,
    });
  });

  it('lists everyone when they fit, with nothing left over', () => {
    expect(summarize_recipient_names([ALICE, BOB], 5)).toEqual({
      names: [ALICE.display_name, BOB.display_name],
      more: 0,
    });
  });

  it('never includes an address', () => {
    expect(JSON.stringify(summarize_recipient_names([ALICE], 5))).not.toContain('@');
  });

  it('handles nobody', () => {
    expect(summarize_recipient_names([], 5)).toEqual({ names: [], more: 0 });
  });
});
