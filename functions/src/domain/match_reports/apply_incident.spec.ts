import { describe, expect, it } from 'vitest';
import { apply_incident } from './apply_incident.js';
import { IncidentType } from './incident_type.enum.js';
import { IncidentValidationCode } from './incident_validation_code.enum.js';
import { IMatchIncident } from './match_incident.model.js';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { TeamSide } from './team_side.enum.js';

function make_incident(overrides: Partial<IMatchIncident> = {}): IMatchIncident {
  return {
    incident_id: 'i1',
    idempotency_key: 'key-1',
    team_side: TeamSide.HOME,
    jersey_number: 7,
    incident_type: IncidentType.YELLOW,
    minute: 45,
    reason_code: null,
    notes: null,
    ...overrides,
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
    incidents: [],
    client_revision: 3,
    lock_version: 1,
    ...overrides,
  };
}

describe('apply_incident', () => {
  it('appends a valid incident and bumps client_revision', () => {
    const report = make_report();
    const incident = make_incident();

    const result = apply_incident(report, incident);

    expect(result.error_code).toBeNull();
    expect(result.was_duplicate).toBe(false);
    expect(result.validation_codes).toEqual([]);
    expect(result.report.incidents).toEqual([incident]);
    expect(result.report.client_revision).toBe(4);
    expect(result.report.lock_version).toBe(1);
  });

  it('does not mutate the input report or incident', () => {
    const report = Object.freeze(make_report({ incidents: [] }));
    const incident = Object.freeze(make_incident());

    const result = apply_incident(report, incident);

    expect(report.incidents).toHaveLength(0);
    expect(report.client_revision).toBe(3);
    expect(result.report).not.toBe(report);
    expect(result.report.incidents[0]).not.toBe(incident);
  });

  it('is idempotent: the same idempotency key changes nothing', () => {
    const first = apply_incident(make_report(), make_incident());
    const retry = apply_incident(first.report, make_incident({ incident_id: 'i2' }));

    expect(retry.was_duplicate).toBe(true);
    expect(retry.error_code).toBeNull();
    expect(retry.report).toBe(first.report);
    expect(retry.report.incidents).toHaveLength(1);
    expect(retry.report.client_revision).toBe(4);
  });

  it('treats a retry as a harmless duplicate even after the report left DRAFT', () => {
    const drafted = apply_incident(make_report(), make_incident()).report;
    const submitted = { ...drafted, status: MatchReportStatus.SUBMITTED };

    const retry = apply_incident(submitted, make_incident());

    expect(retry.was_duplicate).toBe(true);
    expect(retry.error_code).toBeNull();
    expect(retry.report).toBe(submitted);
  });

  it.each([MatchReportStatus.READY, MatchReportStatus.SUBMITTED, MatchReportStatus.NOT_SUPPORTED])(
    'refuses a new incident when the report is %s',
    (status) => {
      const report = make_report({ status });

      const result = apply_incident(report, make_incident());

      expect(result.error_code).toBe(ReportEditErrorCode.REPORT_NOT_EDITABLE);
      expect(result.was_duplicate).toBe(false);
      expect(result.report).toBe(report);
    },
  );

  it('refuses an invalid incident and surfaces the validation codes', () => {
    const report = make_report();

    const result = apply_incident(
      report,
      make_incident({ incident_type: IncidentType.RED, team_side: null }),
    );

    expect(result.error_code).toBe(ReportEditErrorCode.INCIDENT_INVALID);
    expect(result.validation_codes).toEqual([IncidentValidationCode.TEAM_SIDE_REQUIRED]);
    expect(result.report).toBe(report);
  });

  it('refuses a new key that reuses an existing incident id', () => {
    const first = apply_incident(make_report(), make_incident()).report;

    const result = apply_incident(first, make_incident({ idempotency_key: 'key-2' }));

    expect(result.error_code).toBe(ReportEditErrorCode.DUPLICATE_INCIDENT_ID);
    expect(result.report).toBe(first);
  });

  it('accumulates distinct incidents in order', () => {
    const a = apply_incident(make_report(), make_incident()).report;
    const b = apply_incident(
      a,
      make_incident({ incident_id: 'i2', idempotency_key: 'key-2', team_side: TeamSide.AWAY }),
    ).report;

    expect(b.incidents.map((i) => i.incident_id)).toEqual(['i1', 'i2']);
    expect(b.client_revision).toBe(5);
  });
});
