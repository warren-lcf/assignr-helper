import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { incident_id_param_schema } from './incident_id_param.schema.js';
import { report_id_param_schema } from './report_id_param.schema.js';

describe('match report path parameter schemas', () => {
  it('accepts a report id', () => {
    expect(parse_with_schema(report_id_param_schema, { report_id: 'r-1_A' })).toEqual({
      ok: true,
      data: { report_id: 'r-1_A' },
    });
  });

  it('accepts a report id with an incident id', () => {
    expect(
      parse_with_schema(incident_id_param_schema, { report_id: 'r1', incident_id: 'i-2' }),
    ).toEqual({ ok: true, data: { report_id: 'r1', incident_id: 'i-2' } });
  });

  it.each([
    ['a report id with a dot', report_id_param_schema, { report_id: 'a.b' }],
    ['a 65 character report id', report_id_param_schema, { report_id: 'r'.repeat(65) }],
    ['an unknown path parameter', report_id_param_schema, { report_id: 'r1', extra: 'x' }],
    ['a missing incident id', incident_id_param_schema, { report_id: 'r1' }],
    [
      'an incident id with a slash',
      incident_id_param_schema,
      { report_id: 'r1', incident_id: 'a/b' },
    ],
  ])('rejects %s', (_name, schema, params) => {
    expect(parse_with_schema(schema, params).ok).toBe(false);
  });
});
