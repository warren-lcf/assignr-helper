import { z } from 'zod';

/**
 * A query-string id filter: letters, digits, `-` and `_` only; a blank value counts as not
 * supplied.
 * @returns A schema producing the id, or null when absent or blank.
 */
export function optional_id_param() {
  return z
    .string()
    .trim()
    .regex(/^([A-Za-z0-9_-]{1,64})?$/, 'Must be 1 to 64 letters, digits, - or _')
    .transform((value) => (value === '' ? null : value))
    .default(null);
}
