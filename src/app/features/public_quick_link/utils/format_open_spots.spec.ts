import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';
import { format_open_spots } from './format_open_spots';

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? interpolate_translation_params(key, params) : key;

describe('format_open_spots', () => {
  it('says "No open spots" for none (or a negative count)', () => {
    expect(format_open_spots(0, translate)).toBe('No open spots');
    expect(format_open_spots(-1, translate)).toBe('No open spots');
  });

  it('uses the singular for one', () => {
    expect(format_open_spots(1, translate)).toBe('1 open spot');
  });

  it('uses the plural, with a thousands separator', () => {
    expect(format_open_spots(3, translate)).toBe('3 open spots');
    expect(format_open_spots(1234, translate)).toBe(
      `${new Intl.NumberFormat().format(1234)} open spots`,
    );
  });
});
