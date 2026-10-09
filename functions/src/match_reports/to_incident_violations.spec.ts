import { describe, expect, it } from 'vitest';
import { IncidentValidationCode } from '../domain/match_reports/incident_validation_code.enum.js';
import { to_incident_violations } from './to_incident_violations.js';

const PATH_BY_CODE: Record<IncidentValidationCode, string> = {
  [IncidentValidationCode.INCIDENT_ID_REQUIRED]: 'incident_id',
  [IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED]: 'idempotency_key',
  [IncidentValidationCode.IDEMPOTENCY_KEY_TOO_LONG]: 'idempotency_key',
  [IncidentValidationCode.INVALID_INCIDENT_TYPE]: 'incident_type',
  [IncidentValidationCode.INVALID_TEAM_SIDE]: 'team_side',
  [IncidentValidationCode.TEAM_SIDE_REQUIRED]: 'team_side',
  [IncidentValidationCode.INVALID_JERSEY_NUMBER]: 'jersey_number',
  [IncidentValidationCode.INVALID_MINUTE]: 'minute',
  [IncidentValidationCode.NOTES_TOO_LONG]: 'notes',
};

describe('to_incident_violations', () => {
  it.each(Object.values(IncidentValidationCode))(
    'addresses %s to the request field that caused it, with a message',
    (code) => {
      const [violation, ...rest] = to_incident_violations([code]);

      expect(rest).toEqual([]);
      expect(violation?.path).toBe(PATH_BY_CODE[code]);
      expect(violation?.message.length).toBeGreaterThan(0);
    },
  );

  it('returns one violation per code, in order, and none for no codes', () => {
    expect(
      to_incident_violations([
        IncidentValidationCode.INVALID_MINUTE,
        IncidentValidationCode.NOTES_TOO_LONG,
      ]).map((violation) => violation.path),
    ).toEqual(['minute', 'notes']);
    expect(to_incident_violations([])).toEqual([]);
  });
});
