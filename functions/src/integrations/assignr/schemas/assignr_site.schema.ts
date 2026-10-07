import { z } from 'zod';
import { assignr_id_schema } from './assignr_id.schema.js';

/** A site (an assignor's organization) from `/current_account/sites`. */
export const assignr_site_schema = z.looseObject({
  id: assignr_id_schema,
  name: z.string(),
});
