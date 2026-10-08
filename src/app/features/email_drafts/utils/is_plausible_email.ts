import { EMAIL_ADDRESS_MAX_LENGTH } from '../constants/email_limits.constant';

/** One @, a dot in the domain, no spaces or address-list punctuation. The server has the final say. */
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/**
 * A quick shape check for an email address, enough to catch typos before a
 * request. It does not prove the address exists or accepts mail.
 * @param value The address, already trimmed.
 * @returns True when it looks like an email address.
 */
export function is_plausible_email(value: string): boolean {
  return value.length <= EMAIL_ADDRESS_MAX_LENGTH && EMAIL_PATTERN.test(value);
}
