/** What an address that cannot be recognised as `local@domain` is replaced with. */
const UNRECOGNISED_ADDRESS_MASK = '***';

/**
 * Masks an email address for a log line, an audit row or a public page, so it can identify
 * roughly whose address it was without storing or showing it. The first character of the local
 * part and of the domain survive, and so does the last label of the domain:
 * `jordan@example.com` becomes `j***@e***.com`. Never reveals more than one character of the
 * local part, whatever the input.
 * @param address An email address; surrounding whitespace is ignored.
 * @returns The masked form, or `***` when the value is not shaped like an address.
 */
export function mask_contact_email(address: string): string {
  const trimmed = address.trim();
  const at_index = trimmed.lastIndexOf('@');
  if (at_index <= 0 || at_index === trimmed.length - 1) {
    return UNRECOGNISED_ADDRESS_MASK;
  }
  const local_part = trimmed.slice(0, at_index);
  const domain = trimmed.slice(at_index + 1);
  const last_dot_index = domain.lastIndexOf('.');
  const masked_domain =
    last_dot_index > 0
      ? `${first_character(domain)}***${domain.slice(last_dot_index)}`
      : `${first_character(domain)}***`;
  return `${first_character(local_part)}***@${masked_domain}`;
}

/**
 * Takes the first whole character (code point) of a non-empty text.
 * @param text Non-empty text.
 * @returns Its first character.
 */
function first_character(text: string): string {
  return Array.from(text)[0];
}
