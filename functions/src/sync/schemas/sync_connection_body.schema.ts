import { z } from 'zod';

/** Body of `POST /connections/:connection_id/sync`. Unknown fields are rejected. */
export const sync_connection_body_schema = z.strictObject({
  refresh_reference_data: z.boolean().optional(),
});
