import { createHmac } from 'node:crypto';
import { UNSUBSCRIBE_MAC_CONTEXT } from './unsubscribe_token_constants.js';

/**
 * Computes the HMAC-SHA256 tag over a token's version byte and payload.
 * @param key Secret signing key (at least 32 random bytes).
 * @param signed_bytes The version byte followed by the UTF-8 `tenant_id:contact_id` payload.
 * @returns The 32 byte tag.
 */
export function compute_unsubscribe_mac(key: Buffer, signed_bytes: Buffer): Buffer {
  return createHmac('sha256', key)
    .update(UNSUBSCRIBE_MAC_CONTEXT, 'latin1')
    .update(signed_bytes)
    .digest();
}
