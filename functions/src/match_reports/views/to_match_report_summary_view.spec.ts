import { describe, expect, it } from 'vitest';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import {
  make_contract_incident,
  make_contract_match_report,
} from '../stores/contracts/make_contract_match_report.js';
import { to_match_report_summary_view } from './to_match_report_summary_view.js';

describe('to_match_report_summary_view', () => {
  it('shows the result, the status and the card counts, and nothing else', () => {
    const report = make_contract_match_report('t1', 'r1', {
      game_id: 'g1',
      status: MatchReportStatus.READY,
      home_score: 3,
      away_score: 1,
      notes: 'private note',
      updated_at: 555,
      incidents: [make_contract_incident('i1')],
    });

    const view = to_match_report_summary_view(report);

    expect(view).toEqual({
      report_id: 'r1',
      game_id: 'g1',
      status: 'READY',
      home_score: 3,
      away_score: 1,
      yellow_count: 1,
      red_count: 0,
      updated_at: 555,
    });
    expect(JSON.stringify(view)).not.toContain('private note');
  });

  it('counts yellows (second yellows included) and straight reds across both teams', () => {
    const cards = (
      id: string,
      incident_type: IncidentType,
      team_side: TeamSide,
    ): ReturnType<typeof make_contract_incident> =>
      make_contract_incident(id, { incident_type, team_side });
    const report = make_contract_match_report('t1', 'r1', {
      incidents: [
        cards('a', IncidentType.YELLOW, TeamSide.HOME),
        cards('b', IncidentType.YELLOW, TeamSide.AWAY),
        cards('c', IncidentType.SECOND_YELLOW, TeamSide.AWAY),
        cards('d', IncidentType.RED, TeamSide.HOME),
        cards('e', IncidentType.RED, TeamSide.AWAY),
        cards('f', IncidentType.OTHER, TeamSide.AWAY),
      ],
    });

    const view = to_match_report_summary_view(report);

    expect(view.yellow_count).toBe(3);
    expect(view.red_count).toBe(2);
  });

  it('reports no cards and null scores for an empty report', () => {
    expect(to_match_report_summary_view(make_contract_match_report('t1', 'r1'))).toMatchObject({
      home_score: null,
      away_score: null,
      yellow_count: 0,
      red_count: 0,
    });
  });
});
