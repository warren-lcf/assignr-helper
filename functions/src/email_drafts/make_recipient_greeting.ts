/**
 * Makes the greeting line for one recipient from the first word of their display name.
 * @param display_name The contact's display name.
 * @returns For example `Hi Sam,`, or null when the name has no usable first word.
 */
export function make_recipient_greeting(display_name: string): string | null {
  const first_word = display_name.trim().split(/\s+/)[0] ?? '';
  return first_word === '' ? null : `Hi ${first_word},`;
}
