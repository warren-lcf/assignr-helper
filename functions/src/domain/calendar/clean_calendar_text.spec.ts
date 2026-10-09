import { describe, expect, it } from 'vitest';
import { clean_calendar_text } from './clean_calendar_text.js';

describe('clean_calendar_text', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['only whitespace', ' \t\r\n '],
    ['only control characters', String.fromCharCode(0, 7, 27, 127, 133)],
  ])('gives null for %s', (_case, value) => {
    expect(clean_calendar_text(value, 50)).toBeNull();
  });

  it('keeps ordinary text untouched, including commas, semicolons and quotes', () => {
    expect(clean_calendar_text('Hawks, Eagles; "A" team', 50)).toBe('Hawks, Eagles; "A" team');
  });

  it('collapses line breaks, tabs and runs of spaces into single spaces', () => {
    expect(clean_calendar_text('  Riverside\r\nPark\n\n\tField   3 ', 50)).toBe(
      'Riverside Park Field 3',
    );
  });

  it('turns the Unicode line and paragraph separators into spaces', () => {
    const text = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`;

    expect(clean_calendar_text(text, 50)).toBe('a b c');
  });

  it('removes invisible bidirectional overrides', () => {
    const text = `Hawks${String.fromCharCode(0x202e)} vs ${String.fromCharCode(0x2066)}Eagles`;

    expect(clean_calendar_text(text, 50)).toBe('Hawks vs Eagles');
  });

  it('leaves non-Latin text and emoji intact', () => {
    expect(clean_calendar_text('Fußball Élite 足球 \u{1F3C6}', 50)).toBe(
      'Fußball Élite 足球 \u{1F3C6}',
    );
  });

  it('cuts text over the limit and marks it with an ellipsis within the limit', () => {
    const cleaned = clean_calendar_text('a'.repeat(100), 10);

    expect(cleaned).toBe(`${'a'.repeat(9)}…`);
    expect(Array.from(cleaned ?? '')).toHaveLength(10);
  });

  it('accepts text exactly at the limit unchanged', () => {
    expect(clean_calendar_text('a'.repeat(10), 10)).toBe('a'.repeat(10));
  });

  it('never cuts inside a surrogate pair', () => {
    const cleaned = clean_calendar_text('\u{1F3C6}'.repeat(20), 5);

    expect(cleaned).toBe(`${'\u{1F3C6}'.repeat(4)}…`);
    expect(cleaned).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/u);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(clean_calendar_text('abc defgh', 5)).toBe('abc…');
  });
});
