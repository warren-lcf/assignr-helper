import { z } from 'zod';
import { assignr_id_schema } from './assignr_id.schema.js';

/** The caller's user profile on one site, from `/current_account/users`. */
export const assignr_user_schema = z.looseObject({
  id: assignr_id_schema,
});
