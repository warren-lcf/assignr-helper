import { describe, expect, it } from 'vitest';
import { constant_time_token_hash_equals } from './constant_time_token_hash_equals.js';
import { hash_quick_link_token } from './hash_quick_link_token.js';

describe('constant_time_token_hash_equals', () => {
  it('is true for identical hashes', () => {
    const hash = hash_quick_link_token('token');

    expect(constant_time_token_hash_equals(hash, hash_quick_link_token('token'))).toBe(true);
  });

  it('is false for different hashes of equal length', () => {
    expect(
      constant_time_token_hash_equals(hash_quick_link_token('a'), hash_quick_link_token('b')),
    ).toBe(false);
  });

  it('is false, without throwing, for different lengths', () => {
    expect(constant_time_token_hash_equals('abc', 'abcd')).toBe(false);
    expect(constant_time_token_hash_equals('', 'a')).toBe(false);
  });

  it('is true for two empty strings', () => {
    expect(constant_time_token_hash_equals('', '')).toBe(true);
  });

  it('compares multi-byte characters by bytes', () => {
    expect(constant_time_token_hash_equals('é', 'é')).toBe(true);
    expect(constant_time_token_hash_equals('é', 'é')).toBe(false);
  });
});
