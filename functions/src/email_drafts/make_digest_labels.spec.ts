import { describe, expect, it } from 'vitest';
import { DEFAULT_DIGEST_INTRO, make_digest_labels } from './make_digest_labels.js';

describe('make_digest_labels', () => {
  it('uses the draft subject as the email subject whatever the game count', () => {
    const labels = make_digest_labels('Weekend games', null);

    expect(labels.format_subject(0)).toBe('Weekend games');
    expect(labels.format_subject(12)).toBe('Weekend games');
  });

  it('uses the standard intro unless the draft has its own', () => {
    expect(make_digest_labels('s', null).intro).toBe(DEFAULT_DIGEST_INTRO);
    expect(make_digest_labels('s', 'My words').intro).toBe('My words');
  });

  it('pluralises open positions', () => {
    const labels = make_digest_labels('s', null);

    expect(labels.format_open_positions(1)).toBe('1 open position');
    expect(labels.format_open_positions(3)).toBe('3 open positions');
    expect(labels.format_open_positions(0)).toBe('0 open positions');
  });

  it('builds the sign-off and the generated note', () => {
    const labels = make_digest_labels('s', null);

    expect(labels.format_sent_by('Dana')).toBe('Sent by Dana');
    expect(labels.format_generated_at('Oct 7')).toBe('Generated Oct 7');
  });
});
