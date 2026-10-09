import { z } from 'zod';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/** Path parameters for routes addressed by match report. */
export const report_id_param_schema = z.strictObject({
  report_id: resource_id_schema,
});
