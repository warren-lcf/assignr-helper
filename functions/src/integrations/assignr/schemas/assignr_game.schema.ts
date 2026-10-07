import { z } from 'zod';
import { assignr_assignment_schema } from './assignr_assignment.schema.js';
import { assignr_id_schema } from './assignr_id.schema.js';
import { assignr_venue_schema } from './assignr_venue.schema.js';

/**
 * A game as the list and detail endpoints return it. Descriptive fields
 * (`age_group`, `league`, teams, ...) are `unknown` because Assignr may send a
 * string or an embedded object; `to_name` normalises them.
 */
export const assignr_game_schema = z.looseObject({
  id: assignr_id_schema,
  start_time: z.string(),
  end_time: z.string().nullish(),
  time_zone: z.string().nullish(),
  game_time_zone: z.string().nullish(),
  age_group: z.unknown().optional(),
  home_team: z.unknown().optional(),
  away_team: z.unknown().optional(),
  game_type: z.unknown().optional(),
  gender: z.unknown().optional(),
  league: z.unknown().optional(),
  status: z.string().nullish(),
  cancelled: z.boolean().nullish(),
  published: z.boolean().nullish(),
  updated: z.string().nullish(),
  lock_version: z.number().nullish(),
  _embedded: z
    .looseObject({
      venue: assignr_venue_schema.nullish(),
      site: z.looseObject({ id: assignr_id_schema }).nullish(),
      assignments: z.array(assignr_assignment_schema).nullish(),
    })
    .nullish(),
});

/** Parsed game payload. */
export type IAssignrGamePayload = z.infer<typeof assignr_game_schema>;
