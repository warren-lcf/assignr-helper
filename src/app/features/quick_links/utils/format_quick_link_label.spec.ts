import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';
import { format_quick_link_label } from './format_quick_link_label';

describe('format_quick_link_label', () => {
  it('names a link by its creation time', () => {
    const label = format_quick_link_label(
      Date.UTC(2026, 9, 5),
      (ms) => `at ${ms}`,
      (key, params) => (params ? interpolate_translation_params(key, params) : key),
    );

    expect(label).toBe(`Quick link created at ${Date.UTC(2026, 9, 5)}`);
  });
});
