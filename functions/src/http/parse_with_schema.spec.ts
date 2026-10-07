import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parse_with_schema } from './parse_with_schema.js';

const schema = z.strictObject({
  limit: z.number().int().min(1),
  nested: z.object({ name: z.string() }).optional(),
});

describe('parse_with_schema', () => {
  it('returns the parsed data when valid', () => {
    expect(parse_with_schema(schema, { limit: 3 })).toEqual({ ok: true, data: { limit: 3 } });
  });

  it('returns field-level violations with dotted paths', () => {
    const result = parse_with_schema(schema, { limit: 0, nested: { name: 5 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((violation) => violation.path).sort()).toEqual([
      'limit',
      'nested.name',
    ]);
    expect(result.violations.every((violation) => violation.message.length > 0)).toBe(true);
  });

  it('rejects unknown fields from a strict schema', () => {
    const result = parse_with_schema(schema, { limit: 1, extra: true });

    expect(result.ok).toBe(false);
  });

  it('reports a wrong top-level type with an empty path', () => {
    const result = parse_with_schema(schema, 'nope');

    expect(result).toMatchObject({ ok: false, violations: [{ path: '' }] });
  });
});
