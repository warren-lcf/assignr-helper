import { z } from 'zod';

/** An id of a stored resource in a path or body: 1 to 64 letters, digits, `-` and `_`. */
export const resource_id_schema = z
  .string({ error: 'Must be an id' })
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Must be 1 to 64 letters, digits, - or _');
