/**
 * Trims level names, drops blanks and removes repeats (ignoring case), keeping the first spelling and the order.
 * @param levels Levels as typed.
 * @returns The cleaned list.
 */
export function clean_levels(levels: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const level of levels) {
    const trimmed = level.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned;
}
