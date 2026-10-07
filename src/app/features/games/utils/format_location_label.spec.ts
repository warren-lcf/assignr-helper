import { format_location_label } from './format_location_label';

describe('format_location_label', () => {
  it('translates only the backend placeholder', () => {
    const translate = (key: string) => `[${key}]`;

    expect(format_location_label('Location to be announced', translate)).toBe(
      '[Location to be announced]',
    );
    expect(format_location_label('Settings', translate)).toBe('Settings');
  });
});
