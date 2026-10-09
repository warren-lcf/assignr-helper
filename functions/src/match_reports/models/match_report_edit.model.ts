import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { IStoredMatchIncident } from './stored_match_incident.model.js';

/**
 * One atomic change to a stored report: the report's new field values, and at most one incident
 * to add or remove. All of it is saved together or not at all.
 */
export interface IMatchReportEdit {
  status: MatchReportStatus;
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  client_revision: number;
  /** Incident to insert, with its own audit stamps; null for none. */
  add_incident: IStoredMatchIncident | null;
  /** Id of the incident to delete; null for none. Deleting an id the report does not hold changes nothing. */
  remove_incident_id: string | null;
}
