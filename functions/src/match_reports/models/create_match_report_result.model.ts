import { IStoredMatchReport } from './stored_match_report.model.js';

/** The result of creating a report for a game if it has none. */
export interface ICreateMatchReportResult {
  /** The report the game now has: the new one, or the one that already existed. */
  report: IStoredMatchReport;
  /** True only for the call that stored it. */
  created: boolean;
}
