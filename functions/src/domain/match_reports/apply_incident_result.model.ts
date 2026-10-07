import { IncidentValidationCode } from './incident_validation_code.enum.js';
import { IReportEditResult } from './report_edit_result.model.js';

/** Result of applying an incident to a report. */
export interface IApplyIncidentResult extends IReportEditResult {
  /** True when the idempotency key was already recorded and nothing changed. */
  was_duplicate: boolean;
  /** Validation problems when `error_code` is INCIDENT_INVALID; otherwise empty. */
  validation_codes: IncidentValidationCode[];
}
