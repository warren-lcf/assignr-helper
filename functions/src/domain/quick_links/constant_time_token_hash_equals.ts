import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two token hashes without leaking where they first differ.
 * @param a First hash string.
 * @param b Second hash string.
 * @returns True only when both strings are byte-for-byte identical; false when
 *   their byte lengths differ.
 */
export function constant_time_token_hash_equals(a: string, b: string): boolean {
  const a_bytes = Buffer.from(a, 'utf8');
  const b_bytes = Buffer.from(b, 'utf8');
  if (a_bytes.length !== b_bytes.length) {
    return false;
  }
  return timingSafeEqual(a_bytes, b_bytes);
}
