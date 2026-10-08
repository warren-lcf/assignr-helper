import { describe, expect, it } from 'vitest';
import { RecipientMode } from '../enums/recipient_mode.enum.js';
import { IDraftContent } from '../models/draft_content.model.js';
import { parse_draft_content, serialize_draft_content } from './draft_content_json.js';
import { make_contract_filters } from './contracts/make_contract_draft.js';

const CONTENT: IDraftContent = {
  subject: 'ignored here',
  intro: 'Hello\nthere',
  filters: make_contract_filters({
    search: 'cup',
    level: 'U12',
    date_from: 5,
    only_with_open_slots: true,
  }),
  include_quick_link: true,
  quick_link_expiry_days: 14,
  recipient_mode: RecipientMode.SELECTED,
  contact_ids: ['c1', 'c2'],
};

describe('draft content JSON', () => {
  it('round-trips the content, taking the subject from its own column', () => {
    const json = serialize_draft_content(CONTENT);

    expect(parse_draft_content('The subject', json)).toEqual({
      ...CONTENT,
      subject: 'The subject',
    });
  });

  it('does not put the subject in the JSON', () => {
    expect(serialize_draft_content(CONTENT)).not.toContain('ignored here');
  });

  it('drops unknown filter keys when reading', () => {
    const json = JSON.stringify({
      ...JSON.parse(serialize_draft_content(CONTENT)),
      filters: { ...CONTENT.filters, extra: 'x' },
    });

    expect(parse_draft_content('s', json).filters).toEqual(CONTENT.filters);
  });

  const valid = () => JSON.parse(serialize_draft_content(CONTENT)) as Record<string, unknown>;

  it.each([
    ['is missing', null],
    ['is not text', 5],
    ['is corrupt JSON', '{broken'],
    ['is an array', '[]'],
    ['is null JSON', 'null'],
    ['has another version', JSON.stringify({ ...valid(), version: 2 })],
    ['lacks filters', JSON.stringify({ ...valid(), filters: null })],
    [
      'has a non-text filter',
      JSON.stringify({ ...valid(), filters: { ...CONTENT.filters, level: 5 } }),
    ],
    [
      'has a missing filter',
      JSON.stringify({ ...valid(), filters: { ...CONTENT.filters, league: undefined } }),
    ],
    [
      'has a non-number date',
      JSON.stringify({ ...valid(), filters: { ...CONTENT.filters, date_to: 'x' } }),
    ],
    [
      'has a non-boolean open-slot flag',
      JSON.stringify({ ...valid(), filters: { ...CONTENT.filters, only_with_open_slots: 'yes' } }),
    ],
    ['has a non-text intro', JSON.stringify({ ...valid(), intro: 5 })],
    [
      'has a non-boolean quick link flag',
      JSON.stringify({ ...valid(), include_quick_link: 'yes' }),
    ],
    ['has a non-number expiry', JSON.stringify({ ...valid(), quick_link_expiry_days: '14' })],
    ['has an unknown recipient mode', JSON.stringify({ ...valid(), recipient_mode: 'EVERYONE' })],
    ['has a non-list of contacts', JSON.stringify({ ...valid(), contact_ids: 'c1' })],
    ['has a non-text contact id', JSON.stringify({ ...valid(), contact_ids: [1] })],
  ])('refuses content that %s rather than guessing', (_case, json) => {
    expect(() => parse_draft_content('s', json)).toThrow(/filter_json/);
  });
});
