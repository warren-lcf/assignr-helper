import { describe, expect, it } from 'vitest';
import { email_draft_body_schema } from './email_draft_body.schema.js';

const VALID = {
  subject: ' Weekend games ',
  filters: {},
  include_quick_link: true,
  recipient_mode: 'ALL_CONSENTED',
};

describe('email_draft_body_schema', () => {
  it('resolves every default and trims the subject', () => {
    expect(email_draft_body_schema.parse(VALID)).toEqual({
      subject: 'Weekend games',
      intro: null,
      filters: {
        search: null,
        level: null,
        league: null,
        age_group: null,
        location_group: null,
        organization_id: null,
        connection_id: null,
        only_with_open_slots: false,
        date_from: null,
        date_to: null,
      },
      include_quick_link: true,
      quick_link_expiry_days: 14,
      recipient_mode: 'ALL_CONSENTED',
      contact_ids: [],
    });
  });

  it('keeps the chosen values, removes repeated contact ids and blank filter text', () => {
    const parsed = email_draft_body_schema.parse({
      ...VALID,
      intro: ' Hello\nthere ',
      filters: {
        search: '  cup ',
        level: '',
        only_with_open_slots: true,
        date_from: 5,
        date_to: 10,
      },
      quick_link_expiry_days: 90,
      recipient_mode: 'SELECTED',
      contact_ids: ['b', 'a', 'b'],
    });

    expect(parsed).toMatchObject({
      intro: 'Hello\nthere',
      quick_link_expiry_days: 90,
      contact_ids: ['b', 'a'],
      filters: {
        search: 'cup',
        level: null,
        only_with_open_slots: true,
        date_from: 5,
        date_to: 10,
      },
    });
  });

  it('accepts a window of exactly 400 days and an expiry at both limits', () => {
    const day = 86_400_000;

    expect(
      email_draft_body_schema.safeParse({
        ...VALID,
        quick_link_expiry_days: 1,
        filters: { date_from: 0, date_to: 400 * day },
      }).success,
    ).toBe(true);
    expect(
      email_draft_body_schema.safeParse({ ...VALID, quick_link_expiry_days: 90 }).success,
    ).toBe(true);
  });

  it('points at the field for each kind of problem', () => {
    const result = email_draft_body_schema.safeParse({
      ...VALID,
      subject: 'a\nb',
      recipient_mode: 'ALL_CONSENTED',
      contact_ids: ['c1'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('subject');
    }
    const only_contacts = email_draft_body_schema.safeParse({ ...VALID, contact_ids: ['c1'] });
    expect(only_contacts.success).toBe(false);
    if (!only_contacts.success) {
      expect(only_contacts.error.issues[0].path).toEqual(['contact_ids']);
    }
    const window = email_draft_body_schema.safeParse({
      ...VALID,
      filters: { date_from: 10, date_to: 5 },
    });
    if (!window.success) {
      expect(window.error.issues[0].path).toEqual(['filters', 'date_to']);
    }
    expect(window.success).toBe(false);
  });
});
