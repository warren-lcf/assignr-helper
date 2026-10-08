import { RecipientMode } from '../enums/recipient_mode.enum';
import { OPEN_DRAFT, SELECTED_DRAFT, make_email_draft } from '../mocks/email_draft.mock';
import { blank_draft_form } from './blank_draft_form';
import { draft_to_form_model } from './draft_to_form_model';

describe('blank_draft_form', () => {
  it('starts with no filters, no quick link and everyone who agreed', () => {
    expect(blank_draft_form()).toMatchObject({
      subject: '',
      include_quick_link: false,
      quick_link_expiry_days: 14,
      recipient_mode: RecipientMode.ALL_CONSENTED,
      contact_ids: [],
      date_from: null,
    });
  });
});

describe('draft_to_form_model', () => {
  it('fills the form from a stored draft, with days as local dates', () => {
    const model = draft_to_form_model(OPEN_DRAFT);

    expect(model.subject).toBe(OPEN_DRAFT.subject);
    expect(model.intro).toBe('Hello referees, here is what is open.');
    expect(model.level).toBe('Premier');
    expect(model.league).toBe('');
    expect(model.only_with_open_slots).toBe(true);
    expect(model.include_quick_link).toBe(true);
    expect(model.quick_link_expiry_days).toBe(7);
    expect([
      model.date_from?.getFullYear(),
      model.date_from?.getMonth(),
      model.date_from?.getDate(),
    ]).toEqual([2026, 9, 10]);
  });

  it('treats absent filters as any, and a null intro as empty', () => {
    const model = draft_to_form_model(make_email_draft({ filters: { date_from: null } }));

    expect(model.intro).toBe('');
    expect(model.search).toBe('');
    expect(model.only_with_open_slots).toBe(false);
    expect(model.date_from).toBeNull();
    expect(model.date_to).toBeNull();
  });

  it('copies the chosen contacts rather than sharing the array', () => {
    const model = draft_to_form_model(SELECTED_DRAFT);

    expect(model.contact_ids).toEqual(['contact-1', 'contact-2']);
    expect(model.contact_ids).not.toBe(SELECTED_DRAFT.contact_ids);
  });
});
