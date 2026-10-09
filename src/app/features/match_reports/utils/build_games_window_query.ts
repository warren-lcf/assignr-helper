import { GamesScope } from '../../games/enums/games_scope.enum';
import { IGamesQuery } from '../../games/models/games_query.model';
import {
  DAY_MS,
  HOUR_MS,
  LOOKAHEAD_HOURS,
  LOOKBACK_DAYS,
} from '../constants/match_report_limits.constant';

/**
 * The games query behind the report screens: the referee's own games from the last seven days up to
 * twelve hours ahead (so a game that has just started is never cut off), cancelled games left out.
 * @param now The current time, UTC milliseconds.
 * @returns The query to send to `GET /api/games`.
 */
export function build_games_window_query(now: number): IGamesQuery {
  return {
    scope: GamesScope.MINE,
    only_with_open_slots: false,
    include_cancelled: false,
    from: now - LOOKBACK_DAYS * DAY_MS,
    to: now + LOOKAHEAD_HOURS * HOUR_MS,
  };
}
