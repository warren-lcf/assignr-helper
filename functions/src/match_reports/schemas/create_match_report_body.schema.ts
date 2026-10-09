import { DataClassification } from '@hch-shared-libraries/domain/classification';
import { z } from 'zod';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/** Body of `POST /api/match_reports`. */
export const create_match_report_body_schema = z.strictObject({
  game_id: resource_id_schema.meta({ pii: false, classification: DataClassification.INTERNAL }),
});
