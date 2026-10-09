import { IStoredMatchReport } from './stored_match_report.model.js';

/** The result of recording an incident. */
export interface IAddIncidentResult {
  report: IStoredMatchReport;
  /** True when the idempotency key was already recorded on this report, so nothing was added. */
  was_duplicate: boolean;
}
