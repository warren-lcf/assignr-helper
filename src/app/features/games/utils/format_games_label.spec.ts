import { make_translation_service_double } from '../mocks/translation_service.mock';
import { format_games_label } from './format_games_label';

const translate = make_translation_service_double().translate;

describe('format_games_label', () => {
  it('uses the singular for one game', () => {
    expect(format_games_label(1, translate)).toBe('1 game');
  });

  it('uses the plural for none and for many, with grouped digits', () => {
    expect(format_games_label(0, translate)).toBe('0 games');
    expect(format_games_label(2000, translate)).toBe(
      `${new Intl.NumberFormat().format(2000)} games`,
    );
  });
});
