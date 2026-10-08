/**
 * Lists open positions for a person to read, merging repeats: `['Referee', 'Asst. Referee',
 * 'Asst. Referee']` becomes `Referee, Asst. Referee ×2`. Names keep the order they first appear in.
 * @param positions One entry per open position; blank names are skipped.
 * @returns The list text, or an empty string when no position has a name.
 */
export function format_open_position_names(positions: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const position of positions) {
    const name = position.replace(/\s+/g, ' ').trim();
    if (name.length > 0) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(', ');
}
