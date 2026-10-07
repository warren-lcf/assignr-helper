import { describe, expect, it } from 'vitest';
import { IncidentType } from './incident_type.enum.js';
import { IMatchIncident } from './match_incident.model.js';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { remove_incident } from './remove_incident.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { TeamSide } from './team_side.enum.js';

function make_incident(incident_id: string): IMatchIncident {
  return {
    incident_id,
    idempotency_key: `key-${incident_id}`,
    team_side: TeamSide.HOME,
    jersey_number: null,
    incident_type: IncidentType.YELLOW,
    minute: null,
    reason_code: null,
    notes: null,
  };
}

function make_report(overrides: Partial<IMatchReport> = {}): IMatchReport {
  return {
    report_id: 'r1',
    game_id: 'g1',
    status: MatchReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    notes: null,
    incidents: [make_incident('a'), make_incident('b')],
    client_revision: 2,
    lock_version: 1,
    ...overrides,
  };
}

describe('remove_incident', () => {
  it('removes the incident and bumps client_revision without mutating the input', () => {
    const report = make_report();
    const snapshot = structuredClone(report);

    const result = remove_incident(report, 'a');

    expect(result.error_code).toBeNull();
    expect(result.report.incidents.map((i) => i.incident_id)).toEqual(['b']);
    expect(result.report.client_revision).toBe(3);
    expect(report).toEqual(snapshot);
  });

  it('returns INCIDENT_NOT_FOUND without changing the report', () => {
    const report = make_report();

    const result = remove_incident(report, 'zzz');

    expect(result.error_code).toBe(ReportEditErrorCode.INCIDENT_NOT_FOUND);
    expect(result.report).toBe(report);
  });

  it.each([MatchReportStatus.READY, MatchReportStatus.SUBMITTED, MatchReportStatus.NOT_SUPPORTED])(
    'refuses when the report is %s',
    (status) => {
      const report = make_report({ status });

      const result = remove_incident(report, 'a');

      expect(result.error_code).toBe(ReportEditErrorCode.REPORT_NOT_EDITABLE);
      expect(result.report).toBe(report);
    },
  );
});
