import { describe, expect, it } from 'vitest';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { list_match_reports_query_schema } from './list_match_reports_query.schema.js';

describe('list match reports query schema', () => {
  it('defaults to no filters', () => {
    expect(parse_with_schema(list_match_reports_query_schema, {})).toEqual({
      ok: true,
      data: { status: null, game_id: null },
    });
  });

  it('parses both filters', () => {
    expect(
      parse_with_schema(list_match_reports_query_schema, { status: 'READY', game_id: 'g-1' }),
    ).toEqual({ ok: true, data: { status: MatchReportStatus.READY, game_id: 'g-1' } });
  });

  it('treats blank values as not supplied', () => {
    expect(parse_with_schema(list_match_reports_query_schema, { status: '', game_id: '' })).toEqual(
      { ok: true, data: { status: null, game_id: null } },
    );
  });

  it.each(Object.values(MatchReportStatus))('accepts the status %s', (status) => {
    expect(parse_with_schema(list_match_reports_query_schema, { status })).toMatchObject({
      ok: true,
      data: { status },
    });
  });

  it.each([
    ['an unknown status', { status: 'DONE' }],
    ['a lower-case status', { status: 'ready' }],
    ['a repeated status', { status: ['DRAFT', 'READY'] }],
    ['a game id with bad characters', { game_id: 'a b' }],
    ['an unknown parameter', { limit: '5' }],
  ])('rejects %s', (_name, query) => {
    expect(parse_with_schema(list_match_reports_query_schema, query).ok).toBe(false);
  });
});
