/* eslint-disable no-control-regex -- matching control characters is the whole purpose of this file */

/** Every C0 control, DEL and every C1 control. */
const ANY_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** The same set, except tab, line feed and carriage return. */
const CONTROL_EXCEPT_LINE_BREAKS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** The Unicode line separator and paragraph separator, which some systems treat as line breaks. */
const UNICODE_LINE_SEPARATORS = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];

/**
 * Tells whether a text contains control characters, which have no place in a name, a subject line
 * or an address and are how header injection starts (a carriage return or line feed).
 * @param value Text to test.
 * @param allow_line_breaks When true, tab, line feed and carriage return are tolerated (free text
 *   such as an intro paragraph); every other control character, and the Unicode line and paragraph
 *   separators, are still refused.
 * @returns True when a refused control character is present.
 */
export function has_control_characters(value: string, allow_line_breaks = false): boolean {
  const pattern = allow_line_breaks ? CONTROL_EXCEPT_LINE_BREAKS : ANY_CONTROL;
  return (
    pattern.test(value) || UNICODE_LINE_SEPARATORS.some((separator) => value.includes(separator))
  );
}
