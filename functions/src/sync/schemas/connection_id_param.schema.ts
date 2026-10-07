import { z } from 'zod';

/** Path parameters for routes addressed by connection. */
export const connection_id_param_schema = z.strictObject({
  connection_id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Must be 1 to 64 letters, digits, - or _'),
});
