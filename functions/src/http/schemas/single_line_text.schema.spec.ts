import { describe, expect, it } from 'vitest';
import {
  optional_single_line_text_schema,
  single_line_text_schema,
} from './single_line_text.schema.js';

describe('single_line_text_schema', () => {
  const schema = single_line_text_schema(10);

  it('trims and accepts text within the limit', () => {
    expect(schema.parse('  Sam  ')).toBe('Sam');
    expect(schema.parse('a'.repeat(10))).toBe('a'.repeat(10));
  });

  it.each(['', '   ', 'a'.repeat(11), 'two\nlines', 'cr\rhere', 'tab\there', 'nul\u0000', 5, null])(
    'refuses %j',
    (value) => {
      expect(schema.safeParse(value).success).toBe(false);
    },
  );
});

describe('optional_single_line_text_schema', () => {
  const schema = optional_single_line_text_schema(10);

  it('keeps text, and turns blank or null into null', () => {
    expect(schema.parse(' Sam ')).toBe('Sam');
    expect(schema.parse('   ')).toBeNull();
    expect(schema.parse('')).toBeNull();
    expect(schema.parse(null)).toBeNull();
  });

  it.each(['a'.repeat(11), 'two\nlines', 5])('refuses %j', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
