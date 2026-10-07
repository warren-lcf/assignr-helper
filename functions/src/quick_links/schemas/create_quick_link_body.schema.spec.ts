import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { create_quick_link_body_schema } from './create_quick_link_body.schema.js';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const MIDNIGHT = Date.UTC(2026, 9, 10);
const schema = create_quick_link_body_schema(() => NOW);

/**
 * Parses and returns the violations.
 * @param input Request body.
 * @returns The violations, or an empty list when the body was accepted.
 */
function violations_of(input: unknown) {
  const result = parse_with_schema(schema, input);
  return result.ok ? [] : result.violations;
}

describe('create quick link body schema', () => {
  it('defaults an empty body to an unrestricted link that never expires', () => {
    expect(parse_with_schema(schema, {})).toEqual({
      ok: true,
      data: {
        scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
        expires_at: null,
      },
    });
  });

  it('accepts a full body', () => {
    const result = parse_with_schema(schema, {
      scope: {
        organization_ids: ['org-1', 'org_2'],
        levels: ['  Premier  ', 'U12'],
        date_start: MIDNIGHT,
        date_end: MIDNIGHT + 30 * DAY,
      },
      expires_at: NOW + DAY,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        scope: {
          organization_ids: ['org-1', 'org_2'],
          levels: ['Premier', 'U12'],
          date_start: MIDNIGHT,
          date_end: MIDNIGHT + 30 * DAY,
        },
        expires_at: NOW + DAY,
      },
    });
  });

  it('treats explicit nulls as no restriction and no expiry', () => {
    const result = parse_with_schema(schema, {
      scope: { date_start: null, date_end: null },
      expires_at: null,
    });

    expect(result.ok && result.data).toEqual({
      scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
      expires_at: null,
    });
  });

  it('drops repeated organizations and levels, keeping order', () => {
    const result = parse_with_schema(schema, {
      scope: { organization_ids: ['b', 'a', 'b'], levels: ['U12', 'U10', ' U12 '] },
    });

    expect(result.ok && result.data.scope).toMatchObject({
      organization_ids: ['b', 'a'],
      levels: ['U12', 'U10'],
    });
  });

  it('accepts a single-sided or one-day date window', () => {
    expect(parse_with_schema(schema, { scope: { date_start: MIDNIGHT } }).ok).toBe(true);
    expect(parse_with_schema(schema, { scope: { date_end: MIDNIGHT } }).ok).toBe(true);
    expect(
      parse_with_schema(schema, { scope: { date_start: MIDNIGHT, date_end: MIDNIGHT } }).ok,
    ).toBe(true);
  });

  it('accepts an expiry of exactly 400 days ahead and one millisecond from now', () => {
    expect(parse_with_schema(schema, { expires_at: NOW + 400 * DAY }).ok).toBe(true);
    expect(parse_with_schema(schema, { expires_at: NOW + 1 }).ok).toBe(true);
  });

  it('accepts the maximum counts', () => {
    const result = parse_with_schema(schema, {
      scope: {
        organization_ids: Array.from({ length: 50 }, (_, i) => `org-${i}`),
        levels: Array.from({ length: 20 }, (_, i) => `L${i}`),
      },
    });

    expect(result.ok).toBe(true);
  });

  it('reads the clock again for every parse', () => {
    let time = NOW;
    const moving = create_quick_link_body_schema(() => time);
    const body = { expires_at: NOW + DAY };

    expect(parse_with_schema(moving, body).ok).toBe(true);
    time += 2 * DAY;
    expect(parse_with_schema(moving, body).ok).toBe(false);
  });

  describe('rejections', () => {
    it('rejects unknown fields at both levels', () => {
      expect(violations_of({ tenant_id: 'other' })).toHaveLength(1);
      expect(violations_of({ scope: { token: 'x' } })).toHaveLength(1);
    });

    it.each([
      ['a string', 'nope'],
      ['a list', []],
      ['a number', 3],
    ])('rejects a body that is %s', (_name, body) => {
      expect(violations_of(body)).toHaveLength(1);
    });

    it('rejects too many organizations or levels', () => {
      expect(
        violations_of({
          scope: { organization_ids: Array.from({ length: 51 }, (_, i) => `o${i}`) },
        }).map((v) => v.path),
      ).toEqual(['scope.organization_ids']);
      expect(
        violations_of({ scope: { levels: Array.from({ length: 21 }, (_, i) => `L${i}`) } }).map(
          (v) => v.path,
        ),
      ).toEqual(['scope.levels']);
    });

    it('rejects organization ids with unexpected characters or length', () => {
      expect(violations_of({ scope: { organization_ids: ["o' OR 1=1"] } })[0]?.path).toBe(
        'scope.organization_ids.0',
      );
      expect(violations_of({ scope: { organization_ids: ['a'.repeat(65)] } })).toHaveLength(1);
      expect(violations_of({ scope: { organization_ids: [''] } })).toHaveLength(1);
    });

    it('rejects blank, over-long and non-text levels', () => {
      expect(violations_of({ scope: { levels: ['   '] } })[0]?.message).toBe('Must not be blank');
      expect(violations_of({ scope: { levels: ['x'.repeat(65)] } })[0]?.message).toBe(
        'Must be at most 64 characters',
      );
      expect(violations_of({ scope: { levels: [5] } })).toHaveLength(1);
    });

    it.each([
      ['a string', '2026-10-10'],
      ['a fraction', MIDNIGHT + 0.5],
      ['not midnight', MIDNIGHT + 1],
      ['negative', -DAY],
      ['past the year 2200', Date.UTC(2200, 0, 2)],
    ])('rejects a date that is %s', (_name, value) => {
      expect(violations_of({ scope: { date_start: value } })[0]?.path).toBe('scope.date_start');
      expect(violations_of({ scope: { date_end: value } })[0]?.path).toBe('scope.date_end');
    });

    it('rejects a date window that ends before it starts', () => {
      expect(violations_of({ scope: { date_start: MIDNIGHT + DAY, date_end: MIDNIGHT } })).toEqual([
        { path: 'scope.date_end', message: 'Must not be before date_start' },
      ]);
    });

    it.each([
      ['now', NOW],
      ['the past', NOW - DAY],
    ])('rejects an expiry in %s', (_name, value) => {
      expect(violations_of({ expires_at: value })).toEqual([
        { path: 'expires_at', message: 'Must be in the future' },
      ]);
    });

    it('rejects an expiry more than 400 days ahead', () => {
      expect(violations_of({ expires_at: NOW + 400 * DAY + 1 })).toEqual([
        { path: 'expires_at', message: 'Must be at most 400 days ahead' },
      ]);
    });

    it.each([
      ['a string', 'tomorrow'],
      ['a fraction', NOW + 1.5],
      ['NaN-like text', '1e3'],
    ])('rejects an expiry that is %s', (_name, value) => {
      expect(violations_of({ expires_at: value }).map((v) => v.path)).toEqual(['expires_at']);
    });
  });
});
