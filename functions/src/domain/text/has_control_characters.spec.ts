import { describe, expect, it } from 'vitest';
import { has_control_characters } from './has_control_characters.js';

describe('has_control_characters', () => {
  it.each([
    'a\nb',
    'a\rb',
    'a\r\nBcc: x@y.test',
    'a\tb',
    'a\u0000b',
    'a\u007fb',
    'a\u0085b',
    'a\u2028b',
  ])('refuses %j', (value) => {
    expect(has_control_characters(value)).toBe(true);
  });

  it.each(['plain', 'Zoë Müller', '日本語', 'emoji 🙂', ''])('accepts %j', (value) => {
    expect(has_control_characters(value)).toBe(false);
  });

  it('tolerates tab and line breaks only when asked, never other controls', () => {
    expect(has_control_characters('a\nb\r\nc\td', true)).toBe(false);
    expect(has_control_characters('a\u0000b', true)).toBe(true);
    expect(has_control_characters('a\u001bb', true)).toBe(true);
    expect(has_control_characters('a\u2028b', true)).toBe(true);
  });
});
