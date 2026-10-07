import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { IReportEditResult } from './report_edit_result.model.js';

/**
 * Removes an incident from a DRAFT report. The input report is never mutated.
 * @param report The current report.
 * @param incident_id Id of the incident to remove.
 * @returns The updated report (with `client_revision` bumped), or the original
 *   report plus an error code when the report is not editable or the incident
 *   does not exist.
 */
export function remove_incident(report: IMatchReport, incident_id: string): IReportEditResult {
  if (report.status !== MatchReportStatus.DRAFT) {
    return { report, error_code: ReportEditErrorCode.REPORT_NOT_EDITABLE };
  }
  if (!report.incidents.some((incident) => incident.incident_id === incident_id)) {
    return { report, error_code: ReportEditErrorCode.INCIDENT_NOT_FOUND };
  }
  return {
    report: {
      ...report,
      incidents: report.incidents.filter((incident) => incident.incident_id !== incident_id),
      client_revision: report.client_revision + 1,
    },
    error_code: null,
  };
}
