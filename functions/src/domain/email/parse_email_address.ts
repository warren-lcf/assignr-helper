/** Characters allowed in one dot-separated piece of the local part (RFC 5322 atext, ASCII only). */
const LOCAL_ATOM = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/;

/** One label of the domain: letters, digits and inner hyphens. */
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The last label: letters only, or an internationalised name in its `xn--` form. */
const TOP_LEVEL_LABEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Longest address, and longest local part, that SMTP allows. */
const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;

/**
 * Validates an email address strictly and normalises it. Only plain ASCII `local@domain` forms
 * are accepted: no display names, quotes, comments, spaces, angle brackets, commas, semicolons or
 * control characters, so a value that passes can be placed in a mail header or sent to a mail
 * API as one address and cannot smuggle a second recipient or another header. A domain needs at
 * least two labels (no bare hosts, no IP literals).
 * @param raw Text as entered; surrounding whitespace is ignored.
 * @returns The address trimmed and lower-cased, or null when it is not acceptable.
 */
export function parse_email_address(raw: string): string | null {
  const candidate = raw.trim().toLowerCase();
  if (candidate.length === 0 || candidate.length > MAX_ADDRESS_LENGTH) {
    return null;
  }
  const at_index = candidate.indexOf('@');
  if (at_index <= 0 || at_index !== candidate.lastIndexOf('@')) {
    return null;
  }
  const local_part = candidate.slice(0, at_index);
  const domain = candidate.slice(at_index + 1);
  if (local_part.length > MAX_LOCAL_PART_LENGTH) {
    return null;
  }
  if (!local_part.split('.').every((atom) => LOCAL_ATOM.test(atom))) {
    return null;
  }
  const labels = domain.split('.');
  if (labels.length < 2) {
    return null;
  }
  const top_level = labels[labels.length - 1];
  if (!TOP_LEVEL_LABEL.test(top_level)) {
    return null;
  }
  if (!labels.slice(0, -1).every((label) => DOMAIN_LABEL.test(label))) {
    return null;
  }
  return candidate;
}
