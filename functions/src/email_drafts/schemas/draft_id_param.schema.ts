import { z } from 'zod';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/** Path parameters for routes addressed by draft. */
export const draft_id_param_schema = z.strictObject({
  draft_id: resource_id_schema,
});
