import { ReportStatus } from '../enums/report_status.enum';

/** One row of `GET /api/match_reports`: a report without its incident list. Mirrors the backend. */
export interface IMatchReportSummaryView {
  report_id: string;
  game_id: string;
  status: ReportStatus;
  home_score: number | null;
  away_score: number | null;
  yellow_count: number;
  red_count: number;
  updated_at: number;
}
