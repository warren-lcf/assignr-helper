import { format_relative } from '@hch-shared-libraries/ui-kit/core';
import { IGameView } from '../../games/models/game_view.model';
import { NextUpTiming } from '../enums/next_up_timing.enum';
import { get_next_up_timing } from './get_next_up_timing';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The relative note on the next game: "Starts in 3 hours" before kick-off, "Started 20 minutes ago"
 * once it is under way. The wording of the time itself comes from the ui-kit's relative format, so it
 * follows the viewer's locale.
 * @param game The next game.
 * @param now The current time, UTC milliseconds.
 * @param translate Translates an English key.
 * @param locale The viewer's BCP 47 locale, or undefined for the browser's own.
 * @returns The note.
 */
export function format_next_up_note(
  game: Pick<IGameView, 'start_at'>,
  now: number,
  translate: Translate,
  locale: string | undefined,
): string {
  const when = format_relative(game.start_at, now, locale);
  return get_next_up_timing(game, now) === NextUpTiming.UPCOMING
    ? translate('Starts {{when}}', { when })
    : translate('Started {{when}}', { when });
}
