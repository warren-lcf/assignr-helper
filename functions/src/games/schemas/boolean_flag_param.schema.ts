import { z } from 'zod';

/**
 * A query-string flag that is exactly the text `true` or `false`; absent means false.
 * @returns A schema producing a boolean.
 */
export function boolean_flag_param() {
  return z
    .enum(['true', 'false'], { error: 'Must be true or false' })
    .transform((value) => value === 'true')
    .default(false);
}
