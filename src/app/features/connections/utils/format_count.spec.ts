import { format_count } from './format_count';

describe('format_count', () => {
  it('groups thousands for the locale', () => {
    expect(format_count(1234567)).toBe(new Intl.NumberFormat().format(1234567));
    expect(format_count(0)).toBe('0');
  });
});
