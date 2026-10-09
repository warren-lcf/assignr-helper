import { IGameReportEntry } from './game_report_entry.model';

/** The report list split into what still needs a report and what has one. */
export interface IReportListSections {
  /** Games with no report or a draft, most recent first. */
  needs_report: IGameReportEntry[];
  /** Games whose report is finished, most recent first. */
  reported: IGameReportEntry[];
}
