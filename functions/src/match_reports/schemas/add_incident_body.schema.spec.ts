import { describe, expect, it } from 'vitest';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { add_incident_body_schema } from './add_incident_body.schema.js';

const VALID = {
  idempotency_key: 'abcd1234',
  team_side: 'HOME',
  incident_type: 'YELLOW',
};

describe('add incident body schema', () => {
  it('resolves every omitted optional field to null', () => {
    expect(parse_with_schema(add_incident_body_schema, VALID)).toEqual({
      ok: true,
      data: {
        idempotency_key: 'abcd1234',
        team_side: TeamSide.HOME,
        incident_type: IncidentType.YELLOW,
        jersey_number: null,
        minute: null,
        reason_code: null,
        notes: null,
      },
    });
  });

  it('accepts every field and trims the texts', () => {
    const result = parse_with_schema(add_incident_body_schema, {
      idempotency_key: 'A_b-9'.padEnd(64, 'x'),
      team_side: 'AWAY',
      incident_type: 'SECOND_YELLOW',
      jersey_number: 99,
      minute: 130,
      reason_code: '  DISSENT ',
      notes: '  line one\nline two  ',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        team_side: TeamSide.AWAY,
        incident_type: IncidentType.SECOND_YELLOW,
        jersey_number: 99,
        minute: 130,
        reason_code: 'DISSENT',
        notes: 'line one\nline two',
      },
    });
  });

  it('accepts the lowest values', () => {
    expect(
      parse_with_schema(add_incident_body_schema, { ...VALID, jersey_number: 0, minute: 0 }),
    ).toMatchObject({ ok: true, data: { jersey_number: 0, minute: 0 } });
  });

  it('turns null and blank optional values into null', () => {
    expect(
      parse_with_schema(add_incident_body_schema, {
        ...VALID,
        jersey_number: null,
        minute: null,
        reason_code: '   ',
        notes: ' \n ',
      }),
    ).toMatchObject({
      ok: true,
      data: { jersey_number: null, minute: null, reason_code: null, notes: null },
    });
    expect(
      parse_with_schema(add_incident_body_schema, { ...VALID, reason_code: null, notes: null }),
    ).toMatchObject({ ok: true, data: { reason_code: null, notes: null } });
  });

  it('requires the team side, because the stored incident cannot be without one', () => {
    const result = parse_with_schema(add_incident_body_schema, {
      idempotency_key: 'abcd1234',
      incident_type: 'YELLOW',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.violations.map((violation) => violation.path)).toEqual([
      'team_side',
    ]);
  });

  it('refuses a null team side', () => {
    expect(parse_with_schema(add_incident_body_schema, { ...VALID, team_side: null }).ok).toBe(
      false,
    );
  });

  it.each([
    ['a missing idempotency key', { idempotency_key: undefined }, 'idempotency_key'],
    ['a 7 character key', { idempotency_key: 'abcd123' }, 'idempotency_key'],
    ['a 65 character key', { idempotency_key: 'a'.repeat(65) }, 'idempotency_key'],
    ['a key with a space', { idempotency_key: 'abcd 1234' }, 'idempotency_key'],
    ['a key with a slash', { idempotency_key: 'abcd/1234' }, 'idempotency_key'],
    ['a numeric key', { idempotency_key: 12345678 }, 'idempotency_key'],
    ['a lower-case team side', { team_side: 'home' }, 'team_side'],
    ['an unknown team side', { team_side: 'BOTH' }, 'team_side'],
    ['an unknown incident type', { incident_type: 'ORANGE' }, 'incident_type'],
    ['a missing incident type', { incident_type: undefined }, 'incident_type'],
    ['a jersey number of 100', { jersey_number: 100 }, 'jersey_number'],
    ['a negative jersey number', { jersey_number: -1 }, 'jersey_number'],
    ['a fractional jersey number', { jersey_number: 7.5 }, 'jersey_number'],
    ['a textual jersey number', { jersey_number: '7' }, 'jersey_number'],
    ['a minute of 131', { minute: 131 }, 'minute'],
    ['a negative minute', { minute: -1 }, 'minute'],
    ['a fractional minute', { minute: 1.5 }, 'minute'],
    ['a 65 character reason code', { reason_code: 'r'.repeat(65) }, 'reason_code'],
    ['a reason code with a line break', { reason_code: 'a\nb' }, 'reason_code'],
    ['501 characters of notes', { notes: 'n'.repeat(501) }, 'notes'],
    ['notes with a control character', { notes: 'bad\u0007bell' }, 'notes'],
    ['numeric notes', { notes: 5 }, 'notes'],
  ])('rejects %s', (_name, change, path) => {
    const result = parse_with_schema(add_incident_body_schema, { ...VALID, ...change });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.violations.map((violation) => violation.path)).toContain(path);
  });

  it('accepts 500 characters of notes and a 64 character reason code', () => {
    expect(
      parse_with_schema(add_incident_body_schema, {
        ...VALID,
        notes: 'n'.repeat(500),
        reason_code: 'r'.repeat(64),
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['an unknown field', { tenant_id: 't2' }],
    ['an incident id', { incident_id: 'mine' }],
    ['audit columns', { created_by: 'me' }],
  ])('rejects %s', (_name, extra) => {
    expect(parse_with_schema(add_incident_body_schema, { ...VALID, ...extra }).ok).toBe(false);
  });

  it('does not repeat the values it rejects', () => {
    const result = parse_with_schema(add_incident_body_schema, {
      ...VALID,
      notes: 'SECRET-NOTE'.repeat(60),
      jersey_number: 12345,
    });

    expect(JSON.stringify(result)).not.toContain('SECRET-NOTE');
    expect(JSON.stringify(result)).not.toContain('12345');
  });
});
