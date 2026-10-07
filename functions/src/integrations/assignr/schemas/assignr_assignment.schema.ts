import { z } from 'zod';
import { assignr_id_schema } from './assignr_id.schema.js';

/** An assignment (one officiating position) embedded in a game. */
export const assignr_assignment_schema = z.looseObject({
  id: assignr_id_schema,
  position: z.string().nullish(),
  position_abbreviation: z.string().nullish(),
  position_id: assignr_id_schema.nullish(),
  accepted: z.boolean().nullish(),
  declined: z.boolean().nullish(),
  assigned: z.boolean().nullish(),
  lock_version: z.number().nullish(),
  _embedded: z
    .looseObject({
      official: z
        .looseObject({
          id: assignr_id_schema.nullish(),
          first_name: z.string().nullish(),
          last_name: z.string().nullish(),
          name: z.string().nullish(),
        })
        .nullish(),
      fees: z.array(z.record(z.string(), z.unknown())).nullish(),
    })
    .nullish(),
});
