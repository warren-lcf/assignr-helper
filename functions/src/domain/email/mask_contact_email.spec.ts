import { describe, expect, it } from 'vitest';
import { mask_contact_email } from './mask_contact_email.js';

describe('mask_contact_email', () => {
  it('keeps one character of each side and the last domain label', () => {
    expect(mask_contact_email('jordan@example.com')).toBe('j***@e***.com');
    expect(mask_contact_email('a@b.co.uk')).toBe('a***@b***.uk');
  });

  it('copes with a dotless domain and surrounding whitespace', () => {
    expect(mask_contact_email('  sam@host  ')).toBe('s***@h***');
  });

  it.each(['', 'nobody', '@example.com', 'user@'])('replaces %j entirely', (value) => {
    expect(mask_contact_email(value)).toBe('***');
  });

  it('never exposes more than the first character of the local part', () => {
    expect(mask_contact_email('secretname@secret-host.example.org')).not.toContain('ecret');
  });

  it('does not cut a character in half', () => {
    expect(mask_contact_email('🙂smile@example.com')).toBe('🙂***@e***.com');
  });
});
