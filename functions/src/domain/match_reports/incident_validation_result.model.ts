import { IncidentValidationCode } from './incident_validation_code.enum.js';

/** Outcome of validating an incident. */
export interface IIncidentValidationResult {
  valid: boolean;
  /** Every problem found; empty when valid. */
  codes: IncidentValidationCode[];
}
