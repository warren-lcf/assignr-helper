import { describe, expect, it } from 'vitest';
import { can_mark_ready } from '../domain/match_reports/can_mark_ready.js';
import { IncidentType } from '../domain/match_reports/incident_type.enum.js';
import { IMatchReport } from '../domain/match_reports/match_report.model.js';
import { ReadyBlocker } from '../domain/match_reports/ready_blocker.enum.js';
import { make_contract_match_report } from './stores/contracts/make_contract_match_report.js';
import { to_ready_violations } from './to_ready_violations.js';

/**
 * Builds a domain report whose incidents may lack a team side, as the domain allows.
 * @param overrides Fields to replace.
 * @returns A domain report.
 */
function make_domain_report(overrides: Partial<IMatchReport> = {}): IMatchReport {
  return { ...make_contract_match_report('t1', 'r1'), ...overrides };
}

describe('to_ready_violations', () => {
  it('names a missing home and away score by field', () => {
    const report = make_domain_report();

    const violations = to_ready_violations(report, can_mark_ready(report).blockers);

    expect(violations.map((violation) => violation.path)).toEqual(['home_score', 'away_score']);
    expect(violations.map((violation) => violation.message)).toEqual([
      'The home score is missing',
      'The away score is missing',
    ]);
  });

  it('tells a missing score from an invalid one by message, on the same path', () => {
    const violations = to_ready_violations(make_domain_report(), [
      ReadyBlocker.HOME_SCORE_INVALID,
      ReadyBlocker.AWAY_SCORE_INVALID,
    ]);

    expect(violations).toEqual([
      { path: 'home_score', message: 'The home score is not a whole number from 0 to 99' },
      { path: 'away_score', message: 'The away score is not a whole number from 0 to 99' },
    ]);
  });

  it('names every card that has no team side by its incident id', () => {
    const base = make_contract_match_report('t1', 'r1').incidents;
    const report = make_domain_report({
      home_score: 1,
      away_score: 0,
      incidents: [
        ...base,
        {
          incident_id: 'card-1',
          idempotency_key: 'k1',
          team_side: null,
          jersey_number: null,
          incident_type: IncidentType.YELLOW,
          minute: null,
          reason_code: null,
          notes: null,
        },
        {
          incident_id: 'note-1',
          idempotency_key: 'k2',
          team_side: null,
          jersey_number: null,
          incident_type: IncidentType.OTHER,
          minute: null,
          reason_code: null,
          notes: null,
        },
        {
          incident_id: 'card-2',
          idempotency_key: 'k3',
          team_side: null,
          jersey_number: null,
          incident_type: IncidentType.RED,
          minute: null,
          reason_code: null,
          notes: null,
        },
      ],
    });

    const violations = to_ready_violations(report, can_mark_ready(report).blockers);

    expect(violations.map((violation) => violation.path)).toEqual([
      'incidents[card-1].team_side',
      'incidents[card-2].team_side',
    ]);
  });

  it('reports blockers in the order given, and nothing for no blockers', () => {
    const report = make_domain_report();

    expect(
      to_ready_violations(report, [
        ReadyBlocker.AWAY_SCORE_MISSING,
        ReadyBlocker.HOME_SCORE_MISSING,
      ]).map((violation) => violation.path),
    ).toEqual(['away_score', 'home_score']);
    expect(to_ready_violations(report, [])).toEqual([]);
  });
});
