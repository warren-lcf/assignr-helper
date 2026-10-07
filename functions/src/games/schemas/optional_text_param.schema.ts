import { z } from 'zod';

/**
 * A query-string text filter: surrounding whitespace is dropped and a blank value counts
 * as not supplied.
 * @param max_length Longest accepted text, after trimming.
 * @returns A schema producing the text, or null when absent or blank.
 */
export function optional_text_param(max_length: number) {
  return z
    .string()
    .trim()
    .max(max_length, `Must be at most ${max_length} characters`)
    .transform((value) => (value === '' ? null : value))
    .default(null);
}
