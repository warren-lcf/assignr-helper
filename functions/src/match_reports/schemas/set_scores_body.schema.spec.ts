import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { set_scores_body_schema } from './set_scores_body.schema.js';

const VALID = { home_score: 2, away_score: 1, client_revision: 3 };

describe('set scores body schema', () => {
  it('accepts scores and a revision, leaving the notes undefined', () => {
    expect(parse_with_schema(set_scores_body_schema, VALID)).toEqual({
      ok: true,
      data: { home_score: 2, away_score: 1, notes: undefined, client_revision: 3 },
    });
  });

  it('accepts the lowest and highest scores and a null score', () => {
    expect(
      parse_with_schema(set_scores_body_schema, { ...VALID, home_score: 0, away_score: 99 }),
    ).toMatchObject({ ok: true, data: { home_score: 0, away_score: 99 } });
    expect(
      parse_with_schema(set_scores_body_schema, { ...VALID, home_score: null, away_score: null }),
    ).toMatchObject({ ok: true, data: { home_score: null, away_score: null } });
  });

  it('keeps null notes as null (clear) and trims text notes', () => {
    expect(parse_with_schema(set_scores_body_schema, { ...VALID, notes: null })).toMatchObject({
      ok: true,
      data: { notes: null },
    });
    expect(
      parse_with_schema(set_scores_body_schema, { ...VALID, notes: '  Fine\ngame  ' }),
    ).toMatchObject({ ok: true, data: { notes: 'Fine\ngame' } });
  });

  it('turns blank notes into null so they clear the notes', () => {
    expect(parse_with_schema(set_scores_body_schema, { ...VALID, notes: '  \n ' })).toMatchObject({
      ok: true,
      data: { notes: null },
    });
  });

  it('accepts 2000 characters of notes and revision zero', () => {
    expect(
      parse_with_schema(set_scores_body_schema, {
        ...VALID,
        notes: 'n'.repeat(2000),
        client_revision: 0,
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['a missing home score', { home_score: undefined }, 'home_score'],
    ['a missing away score', { away_score: undefined }, 'away_score'],
    ['a score of 100', { home_score: 100 }, 'home_score'],
    ['a negative score', { away_score: -1 }, 'away_score'],
    ['a fractional score', { home_score: 1.5 }, 'home_score'],
    ['a textual score', { home_score: '2' }, 'home_score'],
    ['a missing revision', { client_revision: undefined }, 'client_revision'],
    ['a negative revision', { client_revision: -1 }, 'client_revision'],
    ['a fractional revision', { client_revision: 1.5 }, 'client_revision'],
    ['a null revision', { client_revision: null }, 'client_revision'],
    ['an unsafe revision', { client_revision: Number.MAX_SAFE_INTEGER }, 'client_revision'],
    ['2001 characters of notes', { notes: 'n'.repeat(2001) }, 'notes'],
    ['notes with a control character', { notes: 'x\u0000y' }, 'notes'],
    ['numeric notes', { notes: 7 }, 'notes'],
  ])('rejects %s', (_name, change, path) => {
    const result = parse_with_schema(set_scores_body_schema, { ...VALID, ...change });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.violations.map((violation) => violation.path)).toContain(path);
  });

  it.each([
    ['an unknown field', { status: 'READY' }],
    ['a tenant id', { tenant_id: 't2' }],
    ['a lock version', { lock_version: 9 }],
  ])('rejects %s', (_name, extra) => {
    expect(parse_with_schema(set_scores_body_schema, { ...VALID, ...extra }).ok).toBe(false);
  });
});
