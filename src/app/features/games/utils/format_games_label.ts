import { format_count } from './format_count';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * "1 game" or "1,234 games".
 * @param count How many games.
 * @param translate Translates an English key.
 * @returns The label.
 */
export function format_games_label(count: number, translate: Translate): string {
  return count === 1
    ? translate('1 game')
    : translate('{{count}} games', { count: format_count(count) });
}
