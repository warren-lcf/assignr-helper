import { clean_levels } from './clean_levels';

describe('clean_levels', () => {
  it('trims, drops blanks and keeps the order', () => {
    expect(clean_levels(['  Premier ', '', '   ', 'Select'])).toEqual(['Premier', 'Select']);
  });

  it('removes repeats ignoring case and keeps the first spelling', () => {
    expect(clean_levels(['Premier', 'premier', 'PREMIER ', 'Select'])).toEqual([
      'Premier',
      'Select',
    ]);
  });

  it('returns an empty list for no levels', () => {
    expect(clean_levels([])).toEqual([]);
  });
});
