import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';

/** Selection criteria for listing a tenant's match reports. */
export interface IListMatchReportsQuery {
  /** Only reports in this status; null for any. */
  status: MatchReportStatus | null;
  /** Only the report of this game; null for any. */
  game_id: string | null;
  /** Most reports to return. */
  limit: number;
}
