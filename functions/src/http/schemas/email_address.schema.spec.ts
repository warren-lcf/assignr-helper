import { describe, expect, it } from 'vitest';
import { email_address_schema } from './email_address.schema.js';

describe('email_address_schema', () => {
  it('trims and lower-cases a valid address', () => {
    expect(email_address_schema.parse('  Sam@Example.COM ')).toBe('sam@example.com');
  });

  it.each([
    'nope',
    '',
    'a@b',
    'sam@example.com\r\nBcc: evil@example.com',
    'Sam <sam@example.com>',
    'a@example.com,b@example.com',
    `${'a'.repeat(400)}@example.com`,
  ])('refuses %j with an actionable message that does not echo the value', (value) => {
    const result = email_address_schema.safeParse(value);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues.map((issue) => issue.message))).not.toContain('@');
    }
  });

  it('refuses a non-text value', () => {
    expect(email_address_schema.safeParse(5).success).toBe(false);
    expect(email_address_schema.safeParse(null).success).toBe(false);
  });
});
