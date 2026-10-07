import { describe, expect, it } from 'vitest';
import { hash_quick_link_token } from './hash_quick_link_token.js';

describe('hash_quick_link_token', () => {
  it('returns 64 lowercase hex characters', () => {
    expect(hash_quick_link_token('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known SHA-256 of "abc"', () => {
    expect(hash_quick_link_token('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and input-sensitive', () => {
    expect(hash_quick_link_token('a')).toBe(hash_quick_link_token('a'));
    expect(hash_quick_link_token('a')).not.toBe(hash_quick_link_token('b'));
  });

  it('hashes unicode input as UTF-8', () => {
    expect(hash_quick_link_token('café')).toMatch(/^[0-9a-f]{64}$/);
  });
});
