import { compute_unsubscribe_mac } from './compute_unsubscribe_mac.js';
import { UNSUBSCRIBE_ID_PATTERN } from './unsubscribe_token_constants.js';
import { IUnsubscribeSubject } from './unsubscribe_subject.model.js';

/**
 * Makes the token a contact's unsubscribe link carries. The token is stateless: a version byte,
 * the `tenant_id:contact_id` it speaks for, and an HMAC-SHA256 tag over both, all base64url.
 * Without the key nobody can make or alter one, so a contact id alone gets an attacker nowhere.
 * @param subject The contact the token is for.
 * @param key_version Which signing key is used (1 to 255); recorded in the token so keys can rotate.
 * @param key Secret signing key.
 * @returns The token, safe to place in a URL path.
 * @throws Error when an id is not made of letters, digits, `-` and `_`, or the version is out of range.
 */
export function sign_unsubscribe_token(
  subject: IUnsubscribeSubject,
  key_version: number,
  key: Buffer,
): string {
  if (!Number.isInteger(key_version) || key_version < 1 || key_version > 255) {
    throw new Error('The unsubscribe key version must be a whole number from 1 to 255');
  }
  if (
    !UNSUBSCRIBE_ID_PATTERN.test(subject.tenant_id) ||
    !UNSUBSCRIBE_ID_PATTERN.test(subject.contact_id)
  ) {
    throw new Error('An unsubscribe token can only be made for plain tenant and contact ids');
  }
  const signed_bytes = Buffer.concat([
    Buffer.from([key_version]),
    Buffer.from(`${subject.tenant_id}:${subject.contact_id}`, 'utf8'),
  ]);
  return Buffer.concat([signed_bytes, compute_unsubscribe_mac(key, signed_bytes)]).toString(
    'base64url',
  );
}
