import { z } from 'zod';
import { has_control_characters } from '../../domain/text/has_control_characters.js';

/**
 * Builds a schema for a one-line text such as a name or a subject: trimmed, 1 to `max` characters
 * and free of control characters, so a carriage return or line feed can never reach a header.
 * @param max Longest allowed length after trimming.
 * @returns The schema.
 */
export function single_line_text_schema(max: number) {
  return z
    .string({ error: 'Must be text' })
    .trim()
    .min(1, 'Must not be blank')
    .max(max, `Must be at most ${max} characters`)
    .refine((value) => !has_control_characters(value), {
      error: 'Must not contain control characters or line breaks',
    });
}

/**
 * Builds a schema for an optional one-line text: trimmed, at most `max` characters, free of
 * control characters, and blank or null meaning "none".
 * @param max Longest allowed length after trimming.
 * @returns The schema; it yields the text or null.
 */
export function optional_single_line_text_schema(max: number) {
  return z
    .string({ error: 'Must be text' })
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .refine((value) => !has_control_characters(value), {
      error: 'Must not contain control characters or line breaks',
    })
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));
}
