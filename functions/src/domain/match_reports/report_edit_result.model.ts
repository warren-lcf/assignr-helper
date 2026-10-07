import { IMatchReport } from './match_report.model.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';

/** Result of an edit; `report` is the input report unchanged when `error_code` is set. */
export interface IReportEditResult {
  report: IMatchReport;
  /** Null when the edit was applied. */
  error_code: ReportEditErrorCode | null;
}
