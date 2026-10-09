import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';

/** One line of the report list: the result and the card counts, without the incidents. */
export interface IMatchReportSummaryView {
  report_id: string;
  game_id: string;
  status: MatchReportStatus;
  home_score: number | null;
  away_score: number | null;
  /** Yellow cards shown, counting second yellows (a second yellow is a yellow card). */
  yellow_count: number;
  /** Straight red cards. A second-yellow dismissal is counted under `yellow_count`, never twice. */
  red_count: number;
  updated_at: number;
}
