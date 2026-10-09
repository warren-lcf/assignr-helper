import { IncidentType } from '../enums/incident_type.enum';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { TeamSide } from '../enums/team_side.enum';
import { make_incident, make_report } from '../mocks/match_report.mock';
import { QueuedOperation } from '../models/queued_operation.model';
import { LOCAL_INCIDENT_ID_PREFIX, apply_operation, apply_queue } from './apply_operation';

const SET_SCORES: QueuedOperation = {
  kind: ReportOperationKind.SET_SCORES,
  seq: 1,
  home_score: 3,
  away_score: 2,
  notes: 'Wet pitch',
  client_revision: 5,
};

const ADD: QueuedOperation = {
  kind: ReportOperationKind.ADD_INCIDENT,
  seq: 2,
  idempotency_key: 'key-new-0000001',
  team_side: TeamSide.AWAY,
  incident_type: IncidentType.RED,
  jersey_number: 9,
  minute: 70,
  reason_code: 'DISSENT',
  notes: null,
};

describe('apply_operation', () => {
  it('sets both scores, the notes and raises the revision', () => {
    const report = make_report({ client_revision: 2 });

    const result = apply_operation(report, SET_SCORES);

    expect(result).toMatchObject({
      home_score: 3,
      away_score: 2,
      notes: 'Wet pitch',
      client_revision: 5,
    });
  });

  it('keeps the report’s notes when the score edit carries none', () => {
    const without_notes: QueuedOperation = {
      kind: ReportOperationKind.SET_SCORES,
      seq: 1,
      home_score: 3,
      away_score: 2,
      client_revision: 5,
    };

    const result = apply_operation(make_report({ notes: 'Kept' }), without_notes);

    expect(result.notes).toBe('Kept');
    expect(result.home_score).toBe(3);
  });

  it('never lowers the revision', () => {
    const result = apply_operation(make_report({ client_revision: 9 }), SET_SCORES);

    expect(result.client_revision).toBe(9);
  });

  it('adds a card under a local id until the server gives it a real one', () => {
    const result = apply_operation(make_report(), ADD);

    expect(result.incidents).toEqual([
      {
        incident_id: `${LOCAL_INCIDENT_ID_PREFIX}key-new-0000001`,
        idempotency_key: 'key-new-0000001',
        team_side: TeamSide.AWAY,
        incident_type: IncidentType.RED,
        jersey_number: 9,
        minute: 70,
        reason_code: 'DISSENT',
        notes: null,
      },
    ]);
  });

  it('does not add a card twice when its key is already on the report', () => {
    const report = make_report({
      incidents: [make_incident({ idempotency_key: 'key-new-0000001' })],
    });

    expect(apply_operation(report, ADD)).toBe(report);
  });

  it('removes a card by its idempotency key', () => {
    const report = make_report({
      incidents: [
        make_incident({ incident_id: 'a', idempotency_key: 'key-keep-000001' }),
        make_incident({ incident_id: 'b', idempotency_key: 'key-drop-000002' }),
      ],
    });

    const result = apply_operation(report, {
      kind: ReportOperationKind.REMOVE_INCIDENT,
      seq: 3,
      idempotency_key: 'key-drop-000002',
    });

    expect(result.incidents.map((incident) => incident.incident_id)).toEqual(['a']);
  });

  it('leaves the report it was given untouched', () => {
    const report = make_report();

    apply_operation(report, SET_SCORES);
    apply_operation(report, ADD);

    expect(report).toEqual(make_report());
  });
});

describe('apply_queue', () => {
  it('applies the waiting edits oldest first', () => {
    const result = apply_queue(make_report(), [
      ADD,
      SET_SCORES,
      { ...SET_SCORES, seq: 4, home_score: 4, client_revision: 6 },
    ]);

    expect(result.home_score).toBe(4);
    expect(result.incidents).toHaveLength(1);
  });

  it('is the report itself when nothing is waiting', () => {
    const report = make_report({ home_score: 1 });

    expect(apply_queue(report, [])).toBe(report);
  });
});
