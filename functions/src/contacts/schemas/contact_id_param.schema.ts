import { z } from 'zod';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/** Path parameters for routes addressed by contact. */
export const contact_id_param_schema = z.strictObject({
  contact_id: resource_id_schema,
});
