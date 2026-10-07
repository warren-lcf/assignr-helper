import { describe, expect, it } from 'vitest';
import { IncidentType } from './incident_type.enum.js';
import { IMatchIncident } from './match_incident.model.js';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { summarize_cards } from './summarize_cards.js';
import { TeamSide } from './team_side.enum.js';

let sequence = 0;

function make_incident(incident_type: IncidentType, team_side: TeamSide | null): IMatchIncident {
  sequence += 1;
  return {
    incident_id: `i${sequence}`,
    idempotency_key: `k${sequence}`,
    team_side,
    jersey_number: null,
    incident_type,
    minute: null,
    reason_code: null,
    notes: null,
  };
}

function make_report(incidents: IMatchIncident[]): IMatchReport {
  return {
    report_id: 'r1',
    game_id: 'g1',
    status: MatchReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    notes: null,
    incidents,
    client_revision: 0,
    lock_version: 0,
  };
}

describe('summarize_cards', () => {
  it('returns all zeros for a report with no incidents', () => {
    const zero = { yellow: 0, second_yellow: 0, red: 0 };

    expect(summarize_cards(make_report([]))).toEqual({
      home: zero,
      away: zero,
      unassigned: zero,
    });
  });

  it('counts each type per side and keeps second yellows separate', () => {
    const report = make_report([
      make_incident(IncidentType.YELLOW, TeamSide.HOME),
      make_incident(IncidentType.YELLOW, TeamSide.HOME),
      make_incident(IncidentType.SECOND_YELLOW, TeamSide.HOME),
      make_incident(IncidentType.RED, TeamSide.AWAY),
      make_incident(IncidentType.YELLOW, TeamSide.AWAY),
      make_incident(IncidentType.SECOND_YELLOW, TeamSide.AWAY),
      make_incident(IncidentType.SECOND_YELLOW, TeamSide.AWAY),
    ]);

    expect(summarize_cards(report)).toEqual({
      home: { yellow: 2, second_yellow: 1, red: 0 },
      away: { yellow: 1, second_yellow: 2, red: 1 },
      unassigned: { yellow: 0, second_yellow: 0, red: 0 },
    });
  });

  it('ignores non-card incidents', () => {
    const report = make_report([
      make_incident(IncidentType.OTHER, TeamSide.HOME),
      make_incident(IncidentType.OTHER, null),
    ]);

    const summary = summarize_cards(report);

    expect(summary.home).toEqual({ yellow: 0, second_yellow: 0, red: 0 });
    expect(summary.unassigned).toEqual({ yellow: 0, second_yellow: 0, red: 0 });
  });

  it('reports cards without a team side as unassigned', () => {
    const report = make_report([
      make_incident(IncidentType.RED, null),
      make_incident(IncidentType.YELLOW, null),
    ]);

    expect(summarize_cards(report).unassigned).toEqual({ yellow: 1, second_yellow: 0, red: 1 });
  });

  it('does not mutate the report', () => {
    const report = make_report([make_incident(IncidentType.RED, TeamSide.HOME)]);
    const snapshot = structuredClone(report);

    summarize_cards(report);

    expect(report).toEqual(snapshot);
  });
});
