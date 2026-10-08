import { describe, expect, it } from 'vitest';
import { format_open_position_names } from './format_open_position_names.js';

describe('format_open_position_names', () => {
  it('lists each position once, in the order it first appears', () => {
    expect(format_open_position_names(['Referee', 'Mentor'])).toBe('Referee, Mentor');
  });

  it('merges repeats with a count', () => {
    expect(format_open_position_names(['Referee', 'Asst. Referee', 'Asst. Referee'])).toBe(
      'Referee, Asst. Referee ×2',
    );
  });

  it('collapses whitespace and skips blank names', () => {
    expect(format_open_position_names(['  Asst.\n Referee ', '', '   '])).toBe('Asst. Referee');
  });

  it('returns an empty string for no positions', () => {
    expect(format_open_position_names([])).toBe('');
  });
});
