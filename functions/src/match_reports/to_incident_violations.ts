import { IncidentValidationCode } from '../domain/match_reports/incident_validation_code.enum.js';
import { IViolation } from '../http/models/violation.model.js';

/**
 * Turns the codes found by the domain's `validate_incident` into API violations addressed to the
 * request field that caused each. The body schema already enforces tighter limits, so this is the
 * second line of defence; the messages never repeat request data.
 * @param codes Validation codes reported by the domain.
 * @returns One violation per code.
 */
export function to_incident_violations(codes: IncidentValidationCode[]): IViolation[] {
  return codes.map((code): IViolation => {
    switch (code) {
      case IncidentValidationCode.INCIDENT_ID_REQUIRED:
        return { path: 'incident_id', message: 'An incident id is required' };
      case IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED:
        return { path: 'idempotency_key', message: 'An idempotency key is required' };
      case IncidentValidationCode.IDEMPOTENCY_KEY_TOO_LONG:
        return { path: 'idempotency_key', message: 'The idempotency key is too long' };
      case IncidentValidationCode.INVALID_INCIDENT_TYPE:
        return { path: 'incident_type', message: 'Must be a known incident type' };
      case IncidentValidationCode.INVALID_TEAM_SIDE:
        return { path: 'team_side', message: 'Must be HOME or AWAY' };
      case IncidentValidationCode.TEAM_SIDE_REQUIRED:
        return { path: 'team_side', message: 'A team side is required for this incident' };
      case IncidentValidationCode.INVALID_JERSEY_NUMBER:
        return { path: 'jersey_number', message: 'Must be a whole number' };
      case IncidentValidationCode.INVALID_MINUTE:
        return { path: 'minute', message: 'Must be a whole number from 0 to 130' };
      case IncidentValidationCode.NOTES_TOO_LONG:
        return { path: 'notes', message: 'The notes are too long' };
    }
  });
}
