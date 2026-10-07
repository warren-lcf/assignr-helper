import type { z } from 'zod';
import { IViolation } from './models/violation.model.js';

/** Outcome of validating untrusted input. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; violations: IViolation[] };

/**
 * Validates untrusted input against a Zod schema, turning failures into
 * actionable violations (a 400, never a 500).
 * @param schema Schema to validate with.
 * @param input Untrusted value (a body, query or path parameters).
 * @returns The parsed data, or the field-level violations.
 */
export function parse_with_schema<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    violations: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}
