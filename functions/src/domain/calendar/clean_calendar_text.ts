/**
 * Builds a character-class fragment from code points, so no invisible character has to appear in
 * this source file.
 * @param from First code point of the range.
 * @param to Last code point of the range.
 * @returns A character-class fragment `<from>-<to>` made of the characters themselves.
 */
function range(from: number, to: number): string {
  return `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
}

/** C0 and C1 controls (tab, line feed and carriage return among them) and the Unicode line and paragraph separators. */
const BREAKS_AND_CONTROLS = new RegExp(
  `[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x2028, 0x2029)}]`,
  'g',
);

/** Invisible bidirectional overrides and isolates, which can make a title read differently from what it holds. */
const BIDI_CONTROLS = new RegExp(`[${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}]`, 'g');

const ELLIPSIS = String.fromCharCode(0x2026);

/**
 * Turns provider text into one calm line for a calendar entry: control characters and line breaks
 * become spaces, runs of whitespace collapse to one space, invisible bidirectional overrides are
 * removed, the ends are trimmed, and anything longer than the limit is cut (on a whole character,
 * never inside a surrogate pair) and marked with an ellipsis.
 * @param value Text to clean; null and undefined count as empty.
 * @param max_length Most characters the result may hold, the ellipsis included.
 * @returns The cleaned text, or null when nothing is left.
 */
export function clean_calendar_text(
  value: string | null | undefined,
  max_length: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const collapsed = value
    .replace(BIDI_CONTROLS, '')
    .replace(BREAKS_AND_CONTROLS, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (collapsed === '') {
    return null;
  }
  const characters = Array.from(collapsed);
  if (characters.length <= max_length) {
    return collapsed;
  }
  const kept = characters
    .slice(0, Math.max(max_length - 1, 0))
    .join('')
    .trimEnd();
  return `${kept}${ELLIPSIS}`;
}
