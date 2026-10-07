import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { IReportEditResult } from './report_edit_result.model.js';
import { validate_score } from './validate_score.js';

/**
 * Sets both scores on a DRAFT report. A null score clears that side; any other
 * value must be a whole number from 0 to 99. The input report is never mutated.
 * @param report The current report.
 * @param home_score Home score, or null to clear.
 * @param away_score Away score, or null to clear.
 * @returns The updated report (with `client_revision` bumped), or the original
 *   report plus an error code.
 */
export function set_scores(
  report: IMatchReport,
  home_score: number | null,
  away_score: number | null,
): IReportEditResult {
  if (report.status !== MatchReportStatus.DRAFT) {
    return { report, error_code: ReportEditErrorCode.REPORT_NOT_EDITABLE };
  }
  const is_acceptable = (score: number | null): boolean =>
    score === null || validate_score(score).valid;
  if (!is_acceptable(home_score) || !is_acceptable(away_score)) {
    return { report, error_code: ReportEditErrorCode.SCORE_INVALID };
  }
  return {
    report: { ...report, home_score, away_score, client_revision: report.client_revision + 1 },
    error_code: null,
  };
}
