import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';

/** An incident as the API returns it: never the tenant id or audit stamps. */
export interface IIncidentView {
  incident_id: string;
  idempotency_key: string;
  team_side: TeamSide;
  jersey_number: number | null;
  incident_type: IncidentType;
  minute: number | null;
  reason_code: string | null;
  notes: string | null;
}

/** A match report as the API returns it: never the tenant id or who last changed it. */
export interface IMatchReportView {
  report_id: string;
  game_id: string;
  status: MatchReportStatus;
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  incidents: IIncidentView[];
  /** Revision of the scores and notes; an edit based on an older one is ignored. */
  client_revision: number;
  /** Version of the stored row. */
  lock_version: number;
  created_at: number;
  updated_at: number;
}
