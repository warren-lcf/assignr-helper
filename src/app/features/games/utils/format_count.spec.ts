import { format_count } from './format_count';

describe('format_count', () => {
  it('groups thousands for the locale', () => {
    expect(format_count(2000)).toBe(new Intl.NumberFormat().format(2000));
    expect(format_count(0)).toBe('0');
  });
});
