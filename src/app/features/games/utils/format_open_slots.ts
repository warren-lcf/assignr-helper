import { IGameView } from '../models/game_view.model';
import { format_count } from './format_count';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The slot indicator's text: "2 open of 3 slots".
 * @param game The game.
 * @param translate Translates an English key.
 * @returns The text.
 */
export function format_open_slots(
  game: Pick<IGameView, 'open_slot_count' | 'total_slot_count'>,
  translate: Translate,
): string {
  if (game.total_slot_count <= 0) return translate('No slots listed');
  const params = {
    open: format_count(game.open_slot_count),
    total: format_count(game.total_slot_count),
  };
  return game.total_slot_count === 1
    ? translate('{{open}} open of 1 slot', params)
    : translate('{{open}} open of {{total}} slots', params);
}
