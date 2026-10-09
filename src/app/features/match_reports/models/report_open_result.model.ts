import { IGameView } from '../../games/models/game_view.model';
import { IMatchReportView } from './match_report_view.model';

/** What opening a game's report loads: the report, and the game when it could be found. */
export interface IReportOpenResult {
  report: IMatchReportView;
  /** Null when the game is not among the referee's recent games; the report can still be edited. */
  game: IGameView | null;
}
