import { SAVE_STATE_PRESENTATION } from '../constants/save_state_presentation.constant';
import { SaveState } from '../enums/save_state.enum';

/**
 * The words of the save indicator: "Saved", "Saving…", or how many changes are waiting.
 * @param state What the indicator is in.
 * @param waiting_count How many edits are waiting.
 * @param translate Translates an English key.
 * @returns The translated label.
 */
export function format_save_label(
  state: SaveState,
  waiting_count: number,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const presentation = SAVE_STATE_PRESENTATION[state];
  if (waiting_count === 1 && presentation.label_one) return translate(presentation.label_one);
  return translate(presentation.label, { count: waiting_count });
}
