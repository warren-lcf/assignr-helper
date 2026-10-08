import { describe, expect, it } from 'vitest';
import { hash_email_address } from './hash_email_address.js';

describe('hash_email_address', () => {
  it('is a stable 64 character hex digest that does not contain the address', () => {
    const digest = hash_email_address('sam@example.com');

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hash_email_address('sam@example.com'));
    expect(digest).not.toContain('sam');
  });

  it('differs for different addresses', () => {
    expect(hash_email_address('a@example.com')).not.toBe(hash_email_address('b@example.com'));
  });
});
