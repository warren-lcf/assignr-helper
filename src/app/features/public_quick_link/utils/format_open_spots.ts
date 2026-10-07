/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The open-spots indicator text: "1 open spot", "3 open spots" or "No open spots".
 * @param open_slot_count How many referee spots are open.
 * @param translate Translates an English key.
 * @returns The text.
 */
export function format_open_spots(open_slot_count: number, translate: Translate): string {
  if (open_slot_count <= 0) return translate('No open spots');
  if (open_slot_count === 1) return translate('1 open spot');
  return translate('{{count}} open spots', {
    count: new Intl.NumberFormat().format(open_slot_count),
  });
}
