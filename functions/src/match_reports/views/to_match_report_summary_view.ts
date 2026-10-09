import { summarize_cards } from '../../domain/match_reports/summarize_cards.js';
import { IStoredMatchReport } from '../models/stored_match_report.model.js';
import { IMatchReportSummaryView } from './match_report_summary_view.model.js';

/**
 * Projects a stored report to its list-line shape. Cards are counted with the domain's
 * `summarize_cards`: a second yellow counts as a yellow card and is never also counted as a red.
 * @param report Stored report.
 * @returns The summary view.
 */
export function to_match_report_summary_view(report: IStoredMatchReport): IMatchReportSummaryView {
  const cards = summarize_cards(report);
  return {
    report_id: report.report_id,
    game_id: report.game_id,
    status: report.status,
    home_score: report.home_score,
    away_score: report.away_score,
    yellow_count:
      cards.home.yellow +
      cards.home.second_yellow +
      cards.away.yellow +
      cards.away.second_yellow +
      cards.unassigned.yellow +
      cards.unassigned.second_yellow,
    red_count: cards.home.red + cards.away.red + cards.unassigned.red,
    updated_at: report.updated_at,
  };
}
