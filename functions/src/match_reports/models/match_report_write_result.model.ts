import { MatchReportWriteOutcome } from '../enums/match_report_write_outcome.enum.js';
import { IStoredMatchReport } from './stored_match_report.model.js';

/** The result of writing an edit to a stored report. */
export interface IMatchReportWriteResult {
  outcome: MatchReportWriteOutcome;
  /** The report as written when the outcome is APPLIED; otherwise null. */
  report: IStoredMatchReport | null;
}
