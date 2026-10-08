import { IParsedUnsubscribeToken } from './parsed_unsubscribe_token.model.js';
import {
  UNSUBSCRIBE_ID_PATTERN,
  UNSUBSCRIBE_MAC_LENGTH,
  UNSUBSCRIBE_TOKEN_MAX_LENGTH,
  UNSUBSCRIBE_TOKEN_MIN_LENGTH,
} from './unsubscribe_token_constants.js';

/**
 * Takes an unsubscribe token apart without trusting it: the result says what the token claims
 * and which key it names, and must still be checked with `is_unsubscribe_token_authentic`.
 * Anything that is not exactly what `sign_unsubscribe_token` produces (wrong alphabet, wrong
 * length, non-canonical base64url, missing or extra parts, odd ids) yields null.
 * @param token Text from a URL path.
 * @returns The parsed claims, or null when the token is malformed.
 */
export function parse_unsubscribe_token(token: string): IParsedUnsubscribeToken | null {
  if (
    token.length < UNSUBSCRIBE_TOKEN_MIN_LENGTH ||
    token.length > UNSUBSCRIBE_TOKEN_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return null;
  }
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.toString('base64url') !== token) {
    return null;
  }
  // A version byte, at least "a:b", and the tag.
  if (bytes.length < 1 + 3 + UNSUBSCRIBE_MAC_LENGTH) {
    return null;
  }
  const key_version = bytes[0];
  if (key_version < 1) {
    return null;
  }
  const signed_bytes = bytes.subarray(0, bytes.length - UNSUBSCRIBE_MAC_LENGTH);
  const mac = bytes.subarray(bytes.length - UNSUBSCRIBE_MAC_LENGTH);
  const parts = signed_bytes.subarray(1).toString('utf8').split(':');
  if (parts.length !== 2) {
    return null;
  }
  const [tenant_id, contact_id] = parts;
  if (!UNSUBSCRIBE_ID_PATTERN.test(tenant_id) || !UNSUBSCRIBE_ID_PATTERN.test(contact_id)) {
    return null;
  }
  return {
    key_version,
    subject: { tenant_id, contact_id },
    mac: Buffer.from(mac),
    signed_bytes: Buffer.from(signed_bytes),
  };
}
