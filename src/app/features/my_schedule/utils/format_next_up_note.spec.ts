import { make_translation_service_double } from '../mocks/translation_service.mock';
import { format_next_up_note } from './format_next_up_note';

const NOW = Date.UTC(2026, 9, 10, 15, 0, 0);
const HOUR = 3_600_000;
const translate = make_translation_service_double().translate;

describe('format_next_up_note', () => {
  it('says when a game will start, in the viewer’s relative wording', () => {
    expect(format_next_up_note({ start_at: NOW + 3 * HOUR }, NOW, translate, 'en-US')).toBe(
      'Starts in 3 hours',
    );
  });

  it('says how long ago a game under way started', () => {
    expect(format_next_up_note({ start_at: NOW - 20 * 60_000 }, NOW, translate, 'en-US')).toBe(
      'Started 20 minutes ago',
    );
  });

  it('follows the locale for the time wording', () => {
    expect(format_next_up_note({ start_at: NOW + 3 * HOUR }, NOW, translate, 'es')).toBe(
      'Starts dentro de 3 horas',
    );
  });

  it('translates the sentence around the time', () => {
    const shout = (key: string, params?: Record<string, string | number>) =>
      translate(key, params).toUpperCase();

    expect(format_next_up_note({ start_at: NOW + HOUR }, NOW, shout, 'en-US')).toBe(
      'STARTS IN 1 HOUR',
    );
  });
});
