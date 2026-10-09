import { IStoredMatchIncident } from '../models/stored_match_incident.model.js';
import { IStoredMatchReport } from '../models/stored_match_report.model.js';
import { IIncidentView, IMatchReportView } from './match_report_view.model.js';

/**
 * Projects a stored incident to its API shape, built from an explicit allow-list of fields so
 * nothing added to the row later can leak.
 * @param incident Stored incident.
 * @returns The view.
 */
export function to_incident_view(incident: IStoredMatchIncident): IIncidentView {
  return {
    incident_id: incident.incident_id,
    idempotency_key: incident.idempotency_key,
    team_side: incident.team_side,
    jersey_number: incident.jersey_number,
    incident_type: incident.incident_type,
    minute: incident.minute,
    reason_code: incident.reason_code,
    notes: incident.notes,
  };
}

/**
 * Projects a stored report to its API shape, built from an explicit allow-list of fields so
 * neither the tenant id, the audit actors nor anything added to the row later can leak.
 * @param report Stored report.
 * @returns The view.
 */
export function to_match_report_view(report: IStoredMatchReport): IMatchReportView {
  return {
    report_id: report.report_id,
    game_id: report.game_id,
    status: report.status,
    home_score: report.home_score,
    away_score: report.away_score,
    notes: report.notes,
    incidents: report.incidents.map(to_incident_view),
    client_revision: report.client_revision,
    lock_version: report.lock_version,
    created_at: report.created_at,
    updated_at: report.updated_at,
  };
}
