import { IGameView } from '../../games/models/game_view.model';
import { IMatchReportSummaryView } from './match_report_summary_view.model';

/** One game on the report list, with its report if one was started. */
export interface IGameReportEntry {
  game: IGameView;
  report: IMatchReportSummaryView | null;
}
