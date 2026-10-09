import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { create_match_report_body_schema } from './create_match_report_body.schema.js';

describe('create match report body schema', () => {
  it('accepts a game id', () => {
    expect(parse_with_schema(create_match_report_body_schema, { game_id: 'g-1_A' })).toEqual({
      ok: true,
      data: { game_id: 'g-1_A' },
    });
  });

  it.each([
    ['no game id', {}],
    ['a blank game id', { game_id: '' }],
    ['a game id with a space', { game_id: 'a b' }],
    ['a 65 character game id', { game_id: 'g'.repeat(65) }],
    ['a numeric game id', { game_id: 5 }],
    ['an unknown field', { game_id: 'g1', tenant_id: 't2' }],
  ])('rejects %s', (_name, body) => {
    expect(parse_with_schema(create_match_report_body_schema, body).ok).toBe(false);
  });
});
