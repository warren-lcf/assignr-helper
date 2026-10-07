import { z } from 'zod';
import { IPublicGameFilters } from '../../domain/quick_links/public_game_filters.model.js';
import { optional_text_param } from '../../games/schemas/optional_text_param.schema.js';
import { QUICK_LINK_LIMITS } from '../quick_link_limits.constant.js';

/**
 * The query string of `GET /api/public/q/:token/games`. Unknown parameters are rejected, and a
 * blank value counts as not supplied, as in the signed-in games list.
 */
export const public_games_query_schema = z
  .strictObject({
    search: optional_text_param(QUICK_LINK_LIMITS.MAX_PUBLIC_SEARCH_LENGTH),
    level: optional_text_param(128),
    league: optional_text_param(255),
    location_group: optional_text_param(255),
  })
  .transform((value): IPublicGameFilters => ({
    search: value.search,
    level: value.level,
    league: value.league,
    location_group: value.location_group,
  }));
