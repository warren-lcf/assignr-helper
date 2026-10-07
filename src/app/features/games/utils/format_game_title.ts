import { IGameView } from '../models/game_view.model';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The line that names a game: "Home vs Away", with "To be announced" for a
 * missing side and "Teams to be announced" when both are missing.
 * @param game The game.
 * @param translate Translates an English key.
 * @returns The title.
 */
export function format_game_title(
  game: Pick<IGameView, 'home_team' | 'away_team'>,
  translate: Translate,
): string {
  const home = game.home_team?.trim();
  const away = game.away_team?.trim();
  if (!home && !away) return translate('Teams to be announced');
  return translate('{{home}} vs {{away}}', {
    home: home || translate('To be announced'),
    away: away || translate('To be announced'),
  });
}
