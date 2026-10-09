import { GameStatus } from '../../games/enums/game_status.enum';
import { IGameView } from '../../games/models/game_view.model';
import { ReportStatus } from '../enums/report_status.enum';
import { IGameReportEntry } from '../models/game_report_entry.model';
import { IMatchReportSummaryView } from '../models/match_report_summary_view.model';
import { IReportListSections } from '../models/report_list_sections.model';

/**
 * Splits the referee's recent games into what still needs a report and what already has one. Only games
 * that have started and are not cancelled are listed, most recent first. A game with no report, or a
 * report still in progress, needs a report; any other status counts as reported.
 * @param games The referee's games in the look-back window.
 * @param reports Summaries of the reports that exist.
 * @param now The current time, UTC milliseconds.
 * @returns The two lists.
 */
export function build_report_list_sections(
  games: readonly IGameView[],
  reports: readonly IMatchReportSummaryView[],
  now: number,
): IReportListSections {
  const report_of_game = new Map(reports.map((report) => [report.game_id, report]));
  const entries: IGameReportEntry[] = games
    .filter((game) => game.start_at <= now && game.status !== GameStatus.CANCELLED)
    .sort((a, b) => b.start_at - a.start_at)
    .map((game) => ({ game, report: report_of_game.get(game.game_id) ?? null }));
  return {
    needs_report: entries.filter(
      (entry) => entry.report === null || entry.report.status === ReportStatus.DRAFT,
    ),
    reported: entries.filter(
      (entry) => entry.report !== null && entry.report.status !== ReportStatus.DRAFT,
    ),
  };
}
