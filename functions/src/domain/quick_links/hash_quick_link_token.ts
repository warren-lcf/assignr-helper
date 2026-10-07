import { createHash } from 'node:crypto';

/**
 * Hashes a quick-link token for storage and lookup.
 * @param token The raw bearer token.
 * @returns The SHA-256 digest as 64 lowercase hex characters.
 */
export function hash_quick_link_token(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
