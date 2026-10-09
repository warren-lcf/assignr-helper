import { z } from 'zod';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/** Path parameters for routes addressed by incident within a match report. */
export const incident_id_param_schema = z.strictObject({
  report_id: resource_id_schema,
  incident_id: resource_id_schema,
});
