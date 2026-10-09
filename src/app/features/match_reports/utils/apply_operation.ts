import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { IMatchReportView } from '../models/match_report_view.model';
import { QueuedOperation } from '../models/queued_operation.model';

/** Prefix of the id a card has on this device until the server gives it a real one. */
export const LOCAL_INCIDENT_ID_PREFIX = 'local-';

/**
 * Shows what a report will look like once one waiting edit has been accepted. Used to keep the screen
 * ahead of the server: the screen always shows the last server report with every waiting edit applied.
 * @param report The report so far.
 * @param operation The edit to apply.
 * @returns A new report; the input is not changed.
 */
export function apply_operation(
  report: IMatchReportView,
  operation: QueuedOperation,
): IMatchReportView {
  switch (operation.kind) {
    case ReportOperationKind.SET_SCORES:
      return {
        ...report,
        home_score: operation.home_score,
        away_score: operation.away_score,
        notes: operation.notes === undefined ? report.notes : operation.notes,
        client_revision: Math.max(report.client_revision, operation.client_revision),
      };
    case ReportOperationKind.ADD_INCIDENT:
      if (report.incidents.some((item) => item.idempotency_key === operation.idempotency_key)) {
        return report;
      }
      return {
        ...report,
        incidents: [
          ...report.incidents,
          {
            incident_id: `${LOCAL_INCIDENT_ID_PREFIX}${operation.idempotency_key}`,
            idempotency_key: operation.idempotency_key,
            team_side: operation.team_side,
            incident_type: operation.incident_type,
            jersey_number: operation.jersey_number,
            minute: operation.minute,
            reason_code: operation.reason_code,
            notes: operation.notes,
          },
        ],
      };
    case ReportOperationKind.REMOVE_INCIDENT:
      return {
        ...report,
        incidents: report.incidents.filter(
          (item) => item.idempotency_key !== operation.idempotency_key,
        ),
      };
  }
}

/**
 * Applies every waiting edit, oldest first.
 * @param report The last report the server confirmed.
 * @param queue The edits not yet accepted.
 * @returns The report as the screen shows it.
 */
export function apply_queue(
  report: IMatchReportView,
  queue: readonly QueuedOperation[],
): IMatchReportView {
  return queue.reduce(apply_operation, report);
}
