import { IncidentType } from '../enums/incident_type.enum';
import { ReportStatus } from '../enums/report_status.enum';
import { TeamSide } from '../enums/team_side.enum';
import { IIncidentView } from '../models/incident_view.model';
import { IMatchReportSummaryView } from '../models/match_report_summary_view.model';
import { IMatchReportView } from '../models/match_report_view.model';

/**
 * Builds a card fixture.
 * @param overrides Fields to change from a home yellow card for player 7 in minute 34.
 * @returns The card.
 */
export function make_incident(overrides: Partial<IIncidentView> = {}): IIncidentView {
  return {
    incident_id: 'inc-1',
    idempotency_key: 'key-aaaaaaaaaaaa1',
    team_side: TeamSide.HOME,
    jersey_number: 7,
    incident_type: IncidentType.YELLOW,
    minute: 34,
    reason_code: null,
    notes: null,
    ...overrides,
  };
}

/**
 * Builds a report fixture.
 * @param overrides Fields to change from an empty draft: no scores, no cards.
 * @returns The report.
 */
export function make_report(overrides: Partial<IMatchReportView> = {}): IMatchReportView {
  return {
    report_id: 'report-1',
    game_id: 'game-1',
    status: ReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    notes: null,
    incidents: [],
    client_revision: 0,
    lock_version: 1,
    created_at: 1_000,
    updated_at: 1_000,
    ...overrides,
  };
}

/**
 * Builds a summary fixture.
 * @param overrides Fields to change from a draft with no scores and no cards.
 * @returns The summary.
 */
export function make_summary(
  overrides: Partial<IMatchReportSummaryView> = {},
): IMatchReportSummaryView {
  return {
    report_id: 'report-1',
    game_id: 'game-1',
    status: ReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    yellow_count: 0,
    red_count: 0,
    updated_at: 1_000,
    ...overrides,
  };
}

/** A finished 2 to 1 report with a yellow for the home team and a red for the away team. */
export const READY_REPORT: IMatchReportView = make_report({
  status: ReportStatus.READY,
  home_score: 2,
  away_score: 1,
  incidents: [
    make_incident(),
    make_incident({
      incident_id: 'inc-2',
      idempotency_key: 'key-bbbbbbbbbbbb2',
      team_side: TeamSide.AWAY,
      incident_type: IncidentType.RED,
      jersey_number: null,
      minute: 80,
    }),
  ],
});
