import { z } from 'zod';
import { assignr_id_schema } from './assignr_id.schema.js';

const text_or_number = z.union([z.string(), z.number()]).nullish();

/**
 * Venue embedded in a game. Address field names come from second-hand docs and
 * are tolerated in several spellings; verify against a live response.
 */
export const assignr_venue_schema = z.looseObject({
  id: assignr_id_schema,
  name: z.string(),
  address: text_or_number,
  address1: text_or_number,
  city: text_or_number,
  state: text_or_number,
  zip: text_or_number,
  postal_code: text_or_number,
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  timezone: z.string().nullish(),
});
