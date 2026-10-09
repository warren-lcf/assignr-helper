import { IncidentType } from '../../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../../domain/match_reports/team_side.enum.js';
import { IMatchReportEdit } from '../../models/match_report_edit.model.js';
import { IStoredMatchIncident } from '../../models/stored_match_incident.model.js';
import { IStoredMatchReport } from '../../models/stored_match_report.model.js';

/**
 * Builds an empty DRAFT report for contract tests.
 * @param tenant_id Owning tenant.
 * @param report_id Primary key of the report within the tenant.
 * @param overrides Fields to replace.
 * @returns A complete report; the game id derives from the report id.
 */
export function make_contract_match_report(
  tenant_id: string,
  report_id: string,
  overrides: Partial<IStoredMatchReport> = {},
): IStoredMatchReport {
  return {
    tenant_id,
    report_id,
    game_id: `game-${report_id}`,
    status: MatchReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    notes: null,
    incidents: [],
    client_revision: 0,
    lock_version: 0,
    created_at: 1000,
    created_by: 'creator',
    updated_at: 1000,
    updated_by: 'creator',
    ...overrides,
  };
}

/**
 * Builds a fully populated incident for contract tests. The idempotency key derives from the id.
 * @param incident_id Primary key of the incident within its report.
 * @param overrides Fields to replace.
 * @returns A complete incident.
 */
export function make_contract_incident(
  incident_id: string,
  overrides: Partial<IStoredMatchIncident> = {},
): IStoredMatchIncident {
  return {
    incident_id,
    idempotency_key: `key-${incident_id}`,
    team_side: TeamSide.HOME,
    jersey_number: 7,
    incident_type: IncidentType.YELLOW,
    minute: 33,
    reason_code: 'DISSENT',
    notes: 'Late tackle',
    created_at: 2000,
    created_by: 'recorder',
    updated_at: 2000,
    updated_by: 'recorder',
    ...overrides,
  };
}

/**
 * Builds an edit that keeps a report as it is, then applies the overrides.
 * @param report The report the edit is for.
 * @param overrides Fields to replace.
 * @returns A complete edit.
 */
export function make_contract_edit(
  report: IStoredMatchReport,
  overrides: Partial<IMatchReportEdit> = {},
): IMatchReportEdit {
  return {
    status: report.status,
    home_score: report.home_score,
    away_score: report.away_score,
    notes: report.notes,
    client_revision: report.client_revision,
    add_incident: null,
    remove_incident_id: null,
    ...overrides,
  };
}
