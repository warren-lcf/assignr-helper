import { describe, expect, it } from 'vitest';
import { IncidentType } from './incident_type.enum.js';
import { IncidentValidationCode } from './incident_validation_code.enum.js';
import { IMatchIncident } from './match_incident.model.js';
import { TeamSide } from './team_side.enum.js';
import { validate_incident } from './validate_incident.js';

function make_incident(overrides: Partial<IMatchIncident> = {}): IMatchIncident {
  return {
    incident_id: 'i1',
    idempotency_key: 'key-1',
    team_side: TeamSide.HOME,
    jersey_number: 7,
    incident_type: IncidentType.YELLOW,
    minute: 45,
    reason_code: null,
    notes: null,
    ...overrides,
  };
}

describe('validate_incident', () => {
  it('accepts a complete incident', () => {
    expect(validate_incident(make_incident())).toEqual({ valid: true, codes: [] });
  });

  it('accepts an incident with all optional fields null', () => {
    expect(
      validate_incident(
        make_incident({ jersey_number: null, minute: null, notes: null, reason_code: null }),
      ).valid,
    ).toBe(true);
  });

  it('accepts boundary values', () => {
    expect(
      validate_incident(
        make_incident({
          jersey_number: 999,
          minute: 130,
          notes: 'x'.repeat(500),
          idempotency_key: 'k'.repeat(64),
        }),
      ).valid,
    ).toBe(true);
    expect(validate_incident(make_incident({ jersey_number: 0, minute: 0 })).valid).toBe(true);
  });

  it('requires an incident id', () => {
    expect(validate_incident(make_incident({ incident_id: '  ' })).codes).toEqual([
      IncidentValidationCode.INCIDENT_ID_REQUIRED,
    ]);
  });

  it('requires a non-empty idempotency key of at most 64 characters', () => {
    expect(validate_incident(make_incident({ idempotency_key: '' })).codes).toEqual([
      IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED,
    ]);
    expect(validate_incident(make_incident({ idempotency_key: '   ' })).codes).toEqual([
      IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED,
    ]);
    expect(validate_incident(make_incident({ idempotency_key: 'k'.repeat(65) })).codes).toEqual([
      IncidentValidationCode.IDEMPOTENCY_KEY_TOO_LONG,
    ]);
  });

  it.each([
    [IncidentType.SECOND_YELLOW, false],
    [IncidentType.RED, false],
    [IncidentType.YELLOW, true],
    [IncidentType.OTHER, true],
  ])('with no team side, %s is valid=%s', (incident_type, valid) => {
    const result = validate_incident(make_incident({ incident_type, team_side: null }));

    expect(result.valid).toBe(valid);
    if (!valid) {
      expect(result.codes).toEqual([IncidentValidationCode.TEAM_SIDE_REQUIRED]);
    }
  });

  it('rejects an unknown incident type or team side from untyped input', () => {
    const bad = make_incident({
      incident_type: 'PURPLE' as IncidentType,
      team_side: 'MIDDLE' as TeamSide,
    });

    expect(validate_incident(bad).codes).toEqual([
      IncidentValidationCode.INVALID_INCIDENT_TYPE,
      IncidentValidationCode.INVALID_TEAM_SIDE,
    ]);
  });

  it.each([-1, 1000, 1.5, NaN, Infinity])('rejects jersey number %s', (jersey_number) => {
    expect(validate_incident(make_incident({ jersey_number })).codes).toEqual([
      IncidentValidationCode.INVALID_JERSEY_NUMBER,
    ]);
  });

  it.each([-1, 131, 45.5, NaN])('rejects minute %s', (minute) => {
    expect(validate_incident(make_incident({ minute })).codes).toEqual([
      IncidentValidationCode.INVALID_MINUTE,
    ]);
  });

  it('rejects notes longer than 500 characters, counting code points', () => {
    expect(validate_incident(make_incident({ notes: 'x'.repeat(501) })).codes).toEqual([
      IncidentValidationCode.NOTES_TOO_LONG,
    ]);
    expect(validate_incident(make_incident({ notes: '\u{1F600}'.repeat(500) })).valid).toBe(true);
    expect(validate_incident(make_incident({ notes: '\u{1F600}'.repeat(501) })).valid).toBe(false);
  });

  it('reports every problem at once', () => {
    const result = validate_incident(
      make_incident({
        incident_id: '',
        idempotency_key: '',
        incident_type: IncidentType.RED,
        team_side: null,
        jersey_number: -5,
        minute: 500,
        notes: 'x'.repeat(501),
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.codes).toEqual([
      IncidentValidationCode.INCIDENT_ID_REQUIRED,
      IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED,
      IncidentValidationCode.TEAM_SIDE_REQUIRED,
      IncidentValidationCode.INVALID_JERSEY_NUMBER,
      IncidentValidationCode.INVALID_MINUTE,
      IncidentValidationCode.NOTES_TOO_LONG,
    ]);
  });
});
