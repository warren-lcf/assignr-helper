import { IApplyIncidentResult } from './apply_incident_result.model.js';
import { IMatchIncident } from './match_incident.model.js';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { validate_incident } from './validate_incident.js';

/**
 * Records an incident on a report. Idempotent: a retry carrying an
 * `idempotency_key` that is already recorded returns the report untouched, even
 * if the report has since left DRAFT. Otherwise only DRAFT reports accept the
 * incident, which must be valid and must not reuse an existing `incident_id`.
 * The input report is never mutated.
 * @param report The current report.
 * @param incident The incident to add.
 * @returns The updated report (with `client_revision` bumped) or the original
 *   report plus an error code.
 */
export function apply_incident(
  report: IMatchReport,
  incident: IMatchIncident,
): IApplyIncidentResult {
  if (report.incidents.some((existing) => existing.idempotency_key === incident.idempotency_key)) {
    return { report, error_code: null, was_duplicate: true, validation_codes: [] };
  }
  if (report.status !== MatchReportStatus.DRAFT) {
    return {
      report,
      error_code: ReportEditErrorCode.REPORT_NOT_EDITABLE,
      was_duplicate: false,
      validation_codes: [],
    };
  }
  const validation = validate_incident(incident);
  if (!validation.valid) {
    return {
      report,
      error_code: ReportEditErrorCode.INCIDENT_INVALID,
      was_duplicate: false,
      validation_codes: validation.codes,
    };
  }
  if (report.incidents.some((existing) => existing.incident_id === incident.incident_id)) {
    return {
      report,
      error_code: ReportEditErrorCode.DUPLICATE_INCIDENT_ID,
      was_duplicate: false,
      validation_codes: [],
    };
  }

  return {
    report: {
      ...report,
      incidents: [...report.incidents, { ...incident }],
      client_revision: report.client_revision + 1,
    },
    error_code: null,
    was_duplicate: false,
    validation_codes: [],
  };
}
