import { IncidentType } from './incident_type.enum.js';
import { IncidentValidationCode } from './incident_validation_code.enum.js';
import { IIncidentValidationResult } from './incident_validation_result.model.js';
import { IMatchIncident } from './match_incident.model.js';
import { TeamSide } from './team_side.enum.js';

const MAX_IDEMPOTENCY_KEY_LENGTH = 64;
const MAX_NOTES_LENGTH = 500;
const MAX_JERSEY_NUMBER = 999;
const MAX_MINUTE = 130;

/**
 * Tests that a value is a whole number inside an inclusive range.
 * @param value Candidate number.
 * @param max Inclusive upper bound; the lower bound is 0.
 * @returns True when the value is an integer from 0 to `max`.
 */
function is_integer_in_range(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * Validates an incident. Every problem is reported, not only the first.
 * Cards that need a team side (second yellow, red) are rejected without one.
 * Runtime enum membership is checked because incidents arrive as parsed JSON.
 * @param incident The incident to check.
 * @returns Validity plus every problem code found.
 */
export function validate_incident(incident: IMatchIncident): IIncidentValidationResult {
  const codes: IncidentValidationCode[] = [];

  if (incident.incident_id.trim().length === 0) {
    codes.push(IncidentValidationCode.INCIDENT_ID_REQUIRED);
  }
  if (incident.idempotency_key.trim().length === 0) {
    codes.push(IncidentValidationCode.IDEMPOTENCY_KEY_REQUIRED);
  } else if (incident.idempotency_key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    codes.push(IncidentValidationCode.IDEMPOTENCY_KEY_TOO_LONG);
  }

  if (!(Object.values(IncidentType) as string[]).includes(incident.incident_type)) {
    codes.push(IncidentValidationCode.INVALID_INCIDENT_TYPE);
  }

  if (incident.team_side === null) {
    if (
      incident.incident_type === IncidentType.SECOND_YELLOW ||
      incident.incident_type === IncidentType.RED
    ) {
      codes.push(IncidentValidationCode.TEAM_SIDE_REQUIRED);
    }
  } else if (!(Object.values(TeamSide) as string[]).includes(incident.team_side)) {
    codes.push(IncidentValidationCode.INVALID_TEAM_SIDE);
  }

  if (
    incident.jersey_number !== null &&
    !is_integer_in_range(incident.jersey_number, MAX_JERSEY_NUMBER)
  ) {
    codes.push(IncidentValidationCode.INVALID_JERSEY_NUMBER);
  }
  if (incident.minute !== null && !is_integer_in_range(incident.minute, MAX_MINUTE)) {
    codes.push(IncidentValidationCode.INVALID_MINUTE);
  }
  if (incident.notes !== null && [...incident.notes].length > MAX_NOTES_LENGTH) {
    codes.push(IncidentValidationCode.NOTES_TOO_LONG);
  }

  return { valid: codes.length === 0, codes };
}
