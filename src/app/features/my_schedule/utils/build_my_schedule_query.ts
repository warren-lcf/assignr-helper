import { GamesScope } from '../../games/enums/games_scope.enum';
import { IGamesQuery } from '../../games/models/games_query.model';
import {
  DAY_MS,
  SCHEDULE_LOOKAHEAD_DAYS,
  SCHEDULE_LOOKBACK_MS,
} from '../constants/my_schedule.constant';

/**
 * The games query behind My Schedule: the referee's own games from three hours ago (so one that has
 * just started is still listed) to 120 days ahead, cancelled games left out.
 * @param now The current time, UTC milliseconds.
 * @returns The query to send to `GET /api/games`.
 */
export function build_my_schedule_query(now: number): IGamesQuery {
  return {
    scope: GamesScope.MINE,
    only_with_open_slots: false,
    include_cancelled: false,
    from: now - SCHEDULE_LOOKBACK_MS,
    to: now + SCHEDULE_LOOKAHEAD_DAYS * DAY_MS,
  };
}
