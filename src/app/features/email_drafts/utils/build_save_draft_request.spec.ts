import { RecipientMode } from '../enums/recipient_mode.enum';
import { OPEN_DRAFT, SELECTED_DRAFT, make_email_draft } from '../mocks/email_draft.mock';
import { blank_draft_form } from './blank_draft_form';
import { build_save_draft_request } from './build_save_draft_request';
import { draft_to_form_model } from './draft_to_form_model';

describe('build_save_draft_request', () => {
  it('sends a blank form as an unfiltered draft to everyone who agreed', () => {
    const request = build_save_draft_request({ ...blank_draft_form(), subject: '  Hello  ' });

    expect(request).toEqual({
      subject: 'Hello',
      intro: null,
      filters: {},
      include_quick_link: false,
      quick_link_expiry_days: 14,
      recipient_mode: RecipientMode.ALL_CONSENTED,
    });
  });

  it('trims the intro and sends null when it is blank', () => {
    expect(
      build_save_draft_request({ ...blank_draft_form(), subject: 'S', intro: '  hi  ' }).intro,
    ).toBe('hi');
    expect(
      build_save_draft_request({ ...blank_draft_form(), subject: 'S', intro: '   ' }).intro,
    ).toBeNull();
  });

  it('leaves unset filters out and keeps set ones, with days as UTC midnight', () => {
    const request = build_save_draft_request({
      ...blank_draft_form(),
      subject: 'S',
      search: ' lions ',
      level: 'Premier',
      only_with_open_slots: true,
      date_from: new Date(2026, 9, 10),
      date_to: new Date(2026, 9, 12),
      organization_id: 'org-1',
    });

    expect(request.filters).toEqual({
      search: 'lions',
      level: 'Premier',
      organization_id: 'org-1',
      only_with_open_slots: true,
      date_from: Date.UTC(2026, 9, 10),
      date_to: Date.UTC(2026, 9, 12),
    });
  });

  it('sends the chosen contacts, sorted, only for a chosen-people draft', () => {
    const chosen = build_save_draft_request({
      ...blank_draft_form(),
      subject: 'S',
      recipient_mode: RecipientMode.SELECTED,
      contact_ids: ['b', 'a'],
    });
    const everyone = build_save_draft_request({
      ...blank_draft_form(),
      subject: 'S',
      contact_ids: ['b', 'a'],
    });

    expect(chosen.contact_ids).toEqual(['a', 'b']);
    expect('contact_ids' in everyone).toBe(false);
  });

  it('falls back to the default expiry when the field is empty', () => {
    expect(
      build_save_draft_request({
        ...blank_draft_form(),
        subject: 'S',
        quick_link_expiry_days: null,
      }).quick_link_expiry_days,
    ).toBe(14);
  });

  it('round-trips a stored draft to an equal request', () => {
    for (const draft of [OPEN_DRAFT, SELECTED_DRAFT, make_email_draft({ intro: 'Hi' })]) {
      const first = build_save_draft_request(draft_to_form_model(draft));
      const second = build_save_draft_request(draft_to_form_model(draft));

      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
    expect(build_save_draft_request(draft_to_form_model(OPEN_DRAFT)).filters).toEqual(
      OPEN_DRAFT.filters,
    );
  });
});
