import { describe, expect, it } from 'vitest';
import { parse_email_address } from './parse_email_address.js';

describe('parse_email_address', () => {
  it('trims and lower-cases a valid address', () => {
    expect(parse_email_address('  Sam.Smith+Games@Example.COM ')).toBe(
      'sam.smith+games@example.com',
    );
  });

  it.each([
    'a@b.co',
    "o'brien@example.org",
    'first.last@sub.example.co.uk',
    'x_y-z@my-host.example.com',
    'user@xn--bcher-kva.example',
    'a@b.xn--p1ai',
  ])('accepts %s', (value) => {
    expect(parse_email_address(value)).toBe(value.toLowerCase());
  });

  it.each([
    '',
    '   ',
    'plain',
    '@example.com',
    'user@',
    'user@@example.com',
    'a@b@example.com',
    'user@localhost',
    'user@example',
    'user@example.c',
    'user@-example.com',
    'user@example-.com',
    'user@exa_mple.com',
    'user@[127.0.0.1]',
    'user@example..com',
    'us..er@example.com',
    '.user@example.com',
    'user.@example.com',
    'us er@example.com',
    'user@exam ple.com',
    '"quoted"@example.com',
    'Name <user@example.com>',
    'user@example.com,other@example.com',
    'user@example.com;other@example.com',
    'user@example.com\r\nBcc: evil@example.com',
    'user@example.com\nBcc: evil@example.com',
    'us\ner@example.com',
    'user@example.com\u0000',
    'üser@example.com',
    'user@exämple.com',
    `${'a'.repeat(65)}@example.com`,
    `user@${'a'.repeat(64)}.com`,
  ])('refuses %j', (value) => {
    expect(parse_email_address(value)).toBeNull();
  });

  it('accepts a 64 character local part but not a 255 character address', () => {
    expect(parse_email_address(`${'a'.repeat(64)}@example.com`)).not.toBeNull();
    const too_long = `a@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(60)}.${'f'.repeat(10)}.com`;
    expect(too_long.length).toBeGreaterThan(254);
    expect(parse_email_address(too_long)).toBeNull();
  });
});
