import { ReportStatus } from '../enums/report_status.enum';

/** The optional filters of `GET /api/match_reports`. */
export interface IReportsQuery {
  status?: ReportStatus;
  game_id?: string;
}
