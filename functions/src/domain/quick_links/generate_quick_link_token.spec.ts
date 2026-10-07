import { describe, expect, it } from 'vitest';
import { generate_quick_link_token } from './generate_quick_link_token.js';

describe('generate_quick_link_token', () => {
  it('returns a base64url token of at least 43 characters', () => {
    const token = generate_quick_link_token();

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats across many calls', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generate_quick_link_token()));

    expect(tokens.size).toBe(500);
  });
});
