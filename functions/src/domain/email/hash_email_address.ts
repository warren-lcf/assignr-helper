import { createHash } from 'node:crypto';

/**
 * Hashes a normalised email address so a suppression record can recognise it again without
 * keeping the address itself.
 * @param normalised_address An address already trimmed and lower-cased (see `parse_email_address`).
 * @returns The SHA-256 digest as 64 lower-case hex characters.
 */
export function hash_email_address(normalised_address: string): string {
  return createHash('sha256').update(normalised_address, 'utf8').digest('hex');
}
