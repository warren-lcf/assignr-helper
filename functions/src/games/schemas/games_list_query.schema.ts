import { z } from 'zod';
import { GameListScope } from '../../sync/enums/game_list_scope.enum.js';
import { GAMES_LIST_LIMITS } from '../games_list_limits.constant.js';
import { IGamesListRequest } from '../models/games_list_request.model.js';
import { boolean_flag_param } from './boolean_flag_param.schema.js';
import { optional_id_param } from './optional_id_param.schema.js';
import { optional_text_param } from './optional_text_param.schema.js';

/** An instant given as whole UTC milliseconds in the query string. */
const epoch_ms_param = z
  .string()
  .regex(/^\d{1,15}$/, 'Must be a whole number of UTC milliseconds')
  .transform(Number);

/**
 * Builds the schema of `GET /api/games`. Unknown parameters are rejected. A missing `from`
 * defaults to three hours before now and a missing `to` to 120 days after now, read from the
 * clock at parse time; the window may not be reversed or longer than 400 days.
 * @param now Clock returning the current instant in UTC milliseconds.
 * @returns A schema that turns query-string values into a resolved request.
 */
export function create_games_list_query_schema(now: () => number) {
  return z
    .strictObject({
      scope: z
        .enum(GameListScope, { error: 'Must be OPEN, MINE or ALL' })
        .default(GameListScope.OPEN),
      from: epoch_ms_param.optional(),
      to: epoch_ms_param.optional(),
      search: optional_text_param(GAMES_LIST_LIMITS.MAX_SEARCH_LENGTH),
      connection_id: optional_id_param(),
      organization_id: optional_id_param(),
      league: optional_text_param(255),
      level: optional_text_param(128),
      age_group: optional_text_param(128),
      location_group: optional_text_param(255),
      only_with_open_slots: boolean_flag_param(),
      include_cancelled: boolean_flag_param(),
    })
    .transform((value, ctx): IGamesListRequest => {
      const current = now();
      const window_start = value.from ?? current - GAMES_LIST_LIMITS.DEFAULT_LOOKBACK_MS;
      const window_end = value.to ?? current + GAMES_LIST_LIMITS.DEFAULT_LOOKAHEAD_MS;
      if (window_end < window_start) {
        ctx.issues.push({
          code: 'custom',
          message: 'Must not be before from',
          path: ['to'],
          input: value.to,
        });
        return z.NEVER;
      }
      if (window_end - window_start > GAMES_LIST_LIMITS.MAX_WINDOW_MS) {
        ctx.issues.push({
          code: 'custom',
          message: `The window may span at most ${GAMES_LIST_LIMITS.MAX_WINDOW_DAYS} days`,
          path: ['to'],
          input: value.to,
        });
        return z.NEVER;
      }
      return {
        scope: value.scope,
        window_start,
        window_end,
        filters: {
          search: value.search,
          connection_id: value.connection_id,
          organization_id: value.organization_id,
          league: value.league,
          level: value.level,
          age_group: value.age_group,
          location_group: value.location_group,
          only_with_open_slots: value.only_with_open_slots,
          include_cancelled: value.include_cancelled,
        },
      };
    });
}
