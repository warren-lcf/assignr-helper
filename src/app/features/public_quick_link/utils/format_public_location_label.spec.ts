import { format_public_location_label } from './format_public_location_label';

describe('format_public_location_label', () => {
  it('translates only the unknown-location placeholder', () => {
    const translate = (key: string) => `T(${key})`;

    expect(format_public_location_label('Location to be announced', translate)).toBe(
      'T(Location to be announced)',
    );
    expect(format_public_location_label('Riverside Park', translate)).toBe('Riverside Park');
  });
});
