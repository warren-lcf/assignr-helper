import { randomBytes } from 'node:crypto';

/**
 * Generates an unguessable, URL-safe bearer token for a quick link.
 * Uses 32 cryptographically random bytes, base64url encoded (43 characters).
 * @returns A new random token. Store only its hash, never the token itself.
 */
export function generate_quick_link_token(): string {
  return randomBytes(32).toString('base64url');
}
