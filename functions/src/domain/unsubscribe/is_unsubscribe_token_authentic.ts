import { timingSafeEqual } from 'node:crypto';
import { compute_unsubscribe_mac } from './compute_unsubscribe_mac.js';
import { IParsedUnsubscribeToken } from './parsed_unsubscribe_token.model.js';

/**
 * Checks a parsed token's HMAC against the key it names, in constant time.
 * @param parsed A token from `parse_unsubscribe_token`.
 * @param key The signing key for `parsed.key_version`.
 * @returns True only when the token was made with this key and has not been altered.
 */
export function is_unsubscribe_token_authentic(
  parsed: IParsedUnsubscribeToken,
  key: Buffer,
): boolean {
  const expected = compute_unsubscribe_mac(key, parsed.signed_bytes);
  return expected.length === parsed.mac.length && timingSafeEqual(expected, parsed.mac);
}
