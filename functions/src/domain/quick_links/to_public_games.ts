import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IPublicGame } from './public_game.model.js';
import { IQuickLinkGameSource } from './quick_link_game_source.model.js';
import { IQuickLinkScope } from './quick_link_scope.model.js';

const MS_PER_DAY = 86_400_000;

/**
 * Resolves the calendar date used for the scope's date window.
 * @param game The game.
 * @returns `local_date` when known, otherwise the UTC date of `start_at`.
 */
function window_date_of(game: IQuickLinkGameSource): number {
  if (game.local_date !== null) {
    return game.local_date;
  }
  return game.start_at - (((game.start_at % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
}

/**
 * Tests a game against a quick link's scope.
 * @param game The game.
 * @param scope The link's scope.
 * @returns True when the game is inside every populated restriction.
 */
function is_in_scope(game: IQuickLinkGameSource, scope: IQuickLinkScope): boolean {
  if (scope.organization_ids.length > 0 && !scope.organization_ids.includes(game.organization_id)) {
    return false;
  }
  if (scope.levels.length > 0 && (game.level === null || !scope.levels.includes(game.level))) {
    return false;
  }
  const date = window_date_of(game);
  if (scope.date_start !== null && date < scope.date_start) {
    return false;
  }
  return scope.date_end === null || date <= scope.date_end;
}

/**
 * Reduces internal games to the public shape served behind a quick link.
 * Keeps only games that are open with at least one unfilled slot, not
 * cancelled, starting after `now`, and within `scope`. Every other field
 * (assignee names, external ids, raw payload, organization name) is stripped by
 * building each output object from an explicit allow-list of keys.
 * When a game has no `local_date`, the scope's date window is applied to the
 * UTC date of `start_at`.
 * @param games Internal games.
 * @param scope The quick link's scope.
 * @param now The current instant in UTC milliseconds.
 * @returns Public games sorted by start time, then game id.
 */
export function to_public_games(
  games: IQuickLinkGameSource[],
  scope: IQuickLinkScope,
  now: number,
): IPublicGame[] {
  return games
    .filter(
      (game) =>
        game.is_open &&
        game.open_slot_count > 0 &&
        game.status !== GameStatus.CANCELLED &&
        game.start_at > now &&
        is_in_scope(game, scope),
    )
    .map((game): IPublicGame => ({
      game_id: game.game_id,
      start_at: game.start_at,
      local_date: game.local_date,
      venue_name: game.venue_name,
      location_group: game.location_group,
      level: game.level,
      league: game.league,
      home_team: game.home_team,
      away_team: game.away_team,
      open_slot_count: game.open_slot_count,
      fee_minor: game.fee_minor,
      currency: game.currency,
    }))
    .sort((a, b) => {
      if (a.start_at !== b.start_at) {
        return a.start_at - b.start_at;
      }
      if (a.game_id < b.game_id) {
        return -1;
      }
      return a.game_id > b.game_id ? 1 : 0;
    });
}
