import { IMatchIncident } from './match_incident.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';

/** A match report captured locally for one game. */
export interface IMatchReport {
  report_id: string;
  game_id: string;
  status: MatchReportStatus;
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  incidents: IMatchIncident[];
  /** Bumped on every local edit so clients can detect stale copies. */
  client_revision: number;
  /** Optimistic-concurrency version of the stored row. */
  lock_version: number;
}
