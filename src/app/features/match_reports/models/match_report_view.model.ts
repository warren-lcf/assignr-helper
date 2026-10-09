import { ReportStatus } from '../enums/report_status.enum';
import { IIncidentView } from './incident_view.model';

/** One match report as the API returns it. Mirrors the backend. */
export interface IMatchReportView {
  report_id: string;
  game_id: string;
  status: ReportStatus;
  /** Final score 0 to 99; null until entered. */
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  incidents: IIncidentView[];
  /** The highest score revision the server has accepted; a lower one is ignored. */
  client_revision: number;
  lock_version: number;
  created_at: number;
  updated_at: number;
}
