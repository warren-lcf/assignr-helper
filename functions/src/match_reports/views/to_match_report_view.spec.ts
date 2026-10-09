import { describe, expect, it } from 'vitest';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import {
  make_contract_incident,
  make_contract_match_report,
} from '../stores/contracts/make_contract_match_report.js';
import { to_incident_view, to_match_report_view } from './to_match_report_view.js';

describe('to_match_report_view', () => {
  it('exposes exactly the allow-listed fields and never the tenant or who changed it', () => {
    const report = make_contract_match_report('t1', 'r1', {
      game_id: 'g1',
      status: MatchReportStatus.READY,
      home_score: 2,
      away_score: 0,
      notes: 'Fine game',
      client_revision: 4,
      lock_version: 6,
      created_at: 100,
      updated_at: 200,
      incidents: [make_contract_incident('i1')],
    });

    const view = to_match_report_view(report);

    expect(view).toEqual({
      report_id: 'r1',
      game_id: 'g1',
      status: 'READY',
      home_score: 2,
      away_score: 0,
      notes: 'Fine game',
      incidents: [
        {
          incident_id: 'i1',
          idempotency_key: 'key-i1',
          team_side: 'HOME',
          jersey_number: 7,
          incident_type: 'YELLOW',
          minute: 33,
          reason_code: 'DISSENT',
          notes: 'Late tackle',
        },
      ],
      client_revision: 4,
      lock_version: 6,
      created_at: 100,
      updated_at: 200,
    });
    expect(Object.keys(view).sort()).toEqual(
      [
        'client_revision',
        'created_at',
        'game_id',
        'home_score',
        'away_score',
        'incidents',
        'lock_version',
        'notes',
        'report_id',
        'status',
        'updated_at',
      ].sort(),
    );
    expect(JSON.stringify(view)).not.toContain('t1');
    expect(JSON.stringify(view)).not.toContain('creator');
    expect(JSON.stringify(view)).not.toContain('recorder');
  });

  it('keeps null scores, notes and incident details as null', () => {
    const view = to_match_report_view(
      make_contract_match_report('t1', 'r1', {
        incidents: [
          make_contract_incident('i1', {
            team_side: TeamSide.AWAY,
            incident_type: IncidentType.OTHER,
            jersey_number: null,
            minute: null,
            reason_code: null,
            notes: null,
          }),
        ],
      }),
    );

    expect(view).toMatchObject({ home_score: null, away_score: null, notes: null });
    expect(view.incidents[0]).toEqual({
      incident_id: 'i1',
      idempotency_key: 'key-i1',
      team_side: 'AWAY',
      jersey_number: null,
      incident_type: 'OTHER',
      minute: null,
      reason_code: null,
      notes: null,
    });
  });

  it('shows an incident without its audit stamps', () => {
    const view = to_incident_view(make_contract_incident('i1'));

    expect(Object.keys(view).sort()).toEqual([
      'idempotency_key',
      'incident_id',
      'incident_type',
      'jersey_number',
      'minute',
      'notes',
      'reason_code',
      'team_side',
    ]);
  });
});
