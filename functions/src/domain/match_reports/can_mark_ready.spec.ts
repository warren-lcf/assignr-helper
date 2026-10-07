import { describe, expect, it } from 'vitest';
import { can_mark_ready } from './can_mark_ready.js';
import { IncidentType } from './incident_type.enum.js';
import { IMatchIncident } from './match_incident.model.js';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReadyBlocker } from './ready_blocker.enum.js';
import { TeamSide } from './team_side.enum.js';

function make_incident(overrides: Partial<IMatchIncident> = {}): IMatchIncident {
  return {
    incident_id: 'i1',
    idempotency_key: 'k1',
    team_side: TeamSide.HOME,
    jersey_number: null,
    incident_type: IncidentType.YELLOW,
    minute: null,
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
    home_score: 2,
    away_score: 1,
    notes: null,
    incidents: [],
    client_revision: 0,
    lock_version: 0,
    ...overrides,
  };
}

describe('can_mark_ready', () => {
  it('is ready with valid scores and no incidents', () => {
    expect(can_mark_ready(make_report())).toEqual({ ready: true, blockers: [] });
  });

  it('accepts a 0-0 result', () => {
    expect(can_mark_ready(make_report({ home_score: 0, away_score: 0 })).ready).toBe(true);
  });

  it('blocks on missing scores', () => {
    expect(can_mark_ready(make_report({ home_score: null, away_score: null }))).toEqual({
      ready: false,
      blockers: [ReadyBlocker.HOME_SCORE_MISSING, ReadyBlocker.AWAY_SCORE_MISSING],
    });
  });

  it('blocks on invalid scores', () => {
    expect(can_mark_ready(make_report({ home_score: 100, away_score: -2 })).blockers).toEqual([
      ReadyBlocker.HOME_SCORE_INVALID,
      ReadyBlocker.AWAY_SCORE_INVALID,
    ]);
  });

  it('blocks when any card lacks a team side, once', () => {
    const report = make_report({
      incidents: [
        make_incident({ incident_id: 'a', team_side: null, incident_type: IncidentType.YELLOW }),
        make_incident({ incident_id: 'b', team_side: null, incident_type: IncidentType.RED }),
      ],
    });

    expect(can_mark_ready(report).blockers).toEqual([ReadyBlocker.CARD_MISSING_TEAM_SIDE]);
  });

  it('does not require a team side for non-card incidents', () => {
    const report = make_report({
      incidents: [make_incident({ team_side: null, incident_type: IncidentType.OTHER })],
    });

    expect(can_mark_ready(report).ready).toBe(true);
  });

  it('lists blockers in a stable order', () => {
    const report = make_report({
      home_score: null,
      away_score: 500,
      incidents: [make_incident({ team_side: null, incident_type: IncidentType.SECOND_YELLOW })],
    });

    expect(can_mark_ready(report).blockers).toEqual([
      ReadyBlocker.HOME_SCORE_MISSING,
      ReadyBlocker.AWAY_SCORE_INVALID,
      ReadyBlocker.CARD_MISSING_TEAM_SIDE,
    ]);
  });
});
