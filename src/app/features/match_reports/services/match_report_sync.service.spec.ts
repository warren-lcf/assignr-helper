import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { IncidentType } from '../enums/incident_type.enum';
import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { ReportStatus } from '../enums/report_status.enum';
import { SaveState } from '../enums/save_state.enum';
import { TeamSide } from '../enums/team_side.enum';
import { FakeReportsServer, make_api_error } from '../mocks/fake_reports_server.mock';
import { make_incident, make_report } from '../mocks/match_report.mock';
import { IAddIncidentRequest } from '../models/add_incident_request.model';
import { IDroppedOperation } from '../models/dropped_operation.model';
import { IMatchReportView } from '../models/match_report_view.model';
import { read_queue_record, write_queue_record } from '../utils/report_queue_storage';
import { MatchReportSyncService } from './match_report_sync.service';
import { MatchReportsApiService } from './match_reports_api.service';

function card(key: string, overrides: Partial<IAddIncidentRequest> = {}): IAddIncidentRequest {
  return {
    idempotency_key: key,
    team_side: TeamSide.HOME,
    incident_type: IncidentType.YELLOW,
    jersey_number: 7,
    minute: 30,
    reason_code: null,
    notes: null,
    ...overrides,
  };
}

interface ISetupOptions {
  report?: IMatchReportView;
  /** False starts the device offline. */
  online?: boolean;
}

function setup(options: ISetupOptions = {}) {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(options.online ?? true);
  const server = new FakeReportsServer(options.report ?? make_report());
  TestBed.configureTestingModule({
    providers: [MatchReportSyncService, { provide: MatchReportsApiService, useValue: server }],
  });
  const sync = TestBed.inject(MatchReportSyncService);
  const dropped: IDroppedOperation[] = [];
  sync.dropped_operations.subscribe((item) => dropped.push(item));
  /** Changes what the browser reports and tells the page, as it does when the signal comes or goes. */
  const set_online = (value: boolean) => {
    online.mockReturnValue(value);
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  };
  return { sync, server, dropped, set_online };
}

describe('MatchReportSyncService', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('starting', () => {
    it('shows the report it is given, with nothing waiting and nothing sent', async () => {
      const { sync, server } = setup();
      expect(sync.report()).toBeNull();

      await sync.start(make_report({ home_score: 1 }));

      expect(sync.report()?.home_score).toBe(1);
      expect(sync.pending_count()).toBe(0);
      expect(sync.save_state()).toBe(SaveState.SAVED);
      expect(server.calls).toEqual([]);
    });

    it('sends edits left waiting by an earlier visit, and clears them once accepted', async () => {
      write_queue_record({
        report_id: 'report-1',
        revision: 5,
        last_seq: 3,
        queue: [
          {
            kind: ReportOperationKind.SET_SCORES,
            seq: 3,
            home_score: 2,
            away_score: 0,
            notes: null,
            client_revision: 5,
          },
        ],
      });
      const { sync, server } = setup();

      await sync.start(make_report());

      expect(server.names()).toEqual(['set_scores']);
      expect(server.report).toMatchObject({ home_score: 2, away_score: 0, client_revision: 5 });
      expect(sync.pending_count()).toBe(0);
      expect(read_queue_record('report-1')).toBeNull();
    });

    it('shows the waiting edits straight away, before they are sent', async () => {
      write_queue_record({
        report_id: 'report-1',
        revision: 1,
        last_seq: 1,
        queue: [
          {
            kind: ReportOperationKind.SET_SCORES,
            seq: 1,
            home_score: 4,
            away_score: 4,
            notes: null,
            client_revision: 1,
          },
        ],
      });
      const { sync } = setup({ online: false });

      await sync.start(make_report());

      expect(sync.report()).toMatchObject({ home_score: 4, away_score: 4 });
      expect(sync.pending_count()).toBe(1);
    });

    it('numbers new score edits after both the server’s revision and the stored one', async () => {
      write_queue_record({
        report_id: 'report-1',
        revision: 9,
        last_seq: 4,
        queue: [
          {
            kind: ReportOperationKind.ADD_INCIDENT,
            seq: 4,
            ...card('key-stored-00001'),
          },
        ],
      });
      const { sync, server } = setup({ online: false });
      await sync.start(make_report({ client_revision: 6 }));

      void sync.set_scores(1, 0);

      expect(read_queue_record('report-1')?.revision).toBe(10);
      expect(server.calls).toEqual([]);
    });
  });

  describe('scores', () => {
    it('applies a score at once, before the server answers, and settles on the server’s report', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const done = sync.set_scores(2, 1);

      expect(sync.report()).toMatchObject({ home_score: 2, away_score: 1 });
      expect(sync.pending_count()).toBe(1);
      expect(sync.save_state()).toBe(SaveState.SAVING);
      release();
      await done;
      expect(sync.pending_count()).toBe(0);
      expect(sync.save_state()).toBe(SaveState.SAVED);
      expect(sync.report()).toMatchObject({ home_score: 2, away_score: 1 });
    });

    it('sends a rising revision with score edits only, and leaves the notes out so the server keeps them', async () => {
      const { sync, server } = setup({ report: make_report({ client_revision: 3, notes: 'Wet' }) });
      await sync.start(server.report);

      await sync.set_scores(1, 0);
      await sync.set_scores(2, 0);

      const bodies = server.calls.map((call) => call.args[1] as Record<string, unknown>);
      expect(bodies).toEqual([
        { home_score: 1, away_score: 0, client_revision: 4 },
        { home_score: 2, away_score: 0, client_revision: 5 },
      ]);
      expect(bodies.every((body) => !('notes' in body))).toBe(true);
      expect(server.report.notes).toBe('Wet');
      expect(sync.report()?.notes).toBe('Wet');
    });

    it('never moves the score revision for a card', async () => {
      const { sync, server } = setup({ report: make_report({ client_revision: 3 }) });
      await sync.start(server.report);

      await sync.add_incident(card('key-revision-0001'));
      await sync.remove_incident('key-revision-0001');
      await sync.set_scores(1, 0);

      expect((server.calls.at(-1)?.args[1] as { client_revision: number }).client_revision).toBe(4);
      expect(read_queue_record('report-1')).toBeNull();
    });

    it('turns score edits made while one is in flight into a single waiting edit', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const first = sync.set_scores(1, 0);
      void sync.set_scores(2, 0);
      void sync.set_scores(3, 0);
      void sync.set_scores(4, 0);

      expect(sync.pending_count()).toBe(2);
      release();
      await first;

      expect(server.names()).toEqual(['set_scores', 'set_scores']);
      expect((server.calls[1].args[1] as { home_score: number }).home_score).toBe(4);
      expect(sync.report()?.home_score).toBe(4);
    });

    it('does not merge a score edit into a different kind of edit', async () => {
      const { sync, server } = setup({ online: false });
      await sync.start(make_report());

      void sync.set_scores(1, 0);
      void sync.add_incident(card('key-between-0001'));
      void sync.set_scores(2, 0);

      expect(sync.pending_count()).toBe(3);
      expect(server.calls).toEqual([]);
    });

    it('takes the server’s report when the server ignored a score as out of date', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      // Another device has since saved a newer score.
      server.report = { ...server.report, client_revision: 50, home_score: 9, away_score: 9 };

      await sync.set_scores(1, 1);

      expect(sync.pending_count()).toBe(0);
      expect(sync.report()).toMatchObject({ home_score: 9, away_score: 9, client_revision: 50 });
    });

    it('ignores edits to a report that is not a draft', async () => {
      const { sync, server } = setup({ report: make_report({ status: ReportStatus.READY }) });
      await sync.start(server.report);

      await sync.set_scores(1, 0);
      await sync.add_incident(card('key-locked-00001'));

      expect(sync.is_editable()).toBe(false);
      expect(sync.pending_count()).toBe(0);
      expect(server.calls).toEqual([]);
    });

    it('ignores edits before a report has been started', async () => {
      const { sync, server } = setup();

      await sync.set_scores(1, 0);
      await sync.add_incident(card('key-early-000001'));
      await sync.remove_incident('key-early-000001');

      expect(server.calls).toEqual([]);
      expect(sync.report()).toBeNull();
    });
  });

  describe('cards', () => {
    it('shows a card at once under a local id, and swaps in the server’s id when it is accepted', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const done = sync.add_incident(card('key-added-000001'));

      expect(sync.report()?.incidents).toHaveLength(1);
      expect(sync.report()?.incidents[0].incident_id).toBe('local-key-added-000001');
      release();
      await done;
      expect(sync.report()?.incidents.map((item) => item.incident_id)).toEqual(['srv-1']);
    });

    it('sends the card with its idempotency key and details', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());

      await sync.add_incident(
        card('key-added-000001', { reason_code: 'DISSENT', jersey_number: null }),
      );

      expect(server.calls[0]).toEqual({
        name: 'add_incident',
        args: [
          'report-1',
          {
            idempotency_key: 'key-added-000001',
            team_side: TeamSide.HOME,
            incident_type: IncidentType.YELLOW,
            jersey_number: null,
            minute: 30,
            reason_code: 'DISSENT',
            notes: null,
          },
        ],
      });
    });

    it('treats the server’s 200 for a card it already has as success', async () => {
      const { sync, server } = setup({
        report: make_report({
          incidents: [make_incident({ incident_id: 'srv-9', idempotency_key: 'key-replay-00001' })],
        }),
      });
      await sync.start(server.report);
      // The card was sent before, the answer got lost, and the edit stayed queued.
      write_queue_record({
        report_id: 'report-1',
        revision: 0,
        last_seq: 1,
        queue: [{ kind: ReportOperationKind.ADD_INCIDENT, seq: 1, ...card('key-replay-00001') }],
      });

      await sync.start(server.report);

      expect(server.names()).toEqual(['add_incident']);
      expect(sync.pending_count()).toBe(0);
      expect(sync.report()?.incidents).toHaveLength(1);
      expect(logged).not.toHaveBeenCalled();
    });

    it('adds nothing when the card’s key is already on the report', async () => {
      const { sync, server } = setup({
        report: make_report({
          incidents: [make_incident({ idempotency_key: 'key-already-0001' })],
        }),
      });
      await sync.start(server.report);

      await sync.add_incident(card('key-already-0001'));

      expect(server.calls).toEqual([]);
    });

    it('removes a card by the id the server gave it, found by its key', async () => {
      const { sync, server } = setup({
        report: make_report({
          incidents: [make_incident({ incident_id: 'srv-9', idempotency_key: 'key-existing-001' })],
        }),
      });
      await sync.start(server.report);

      await sync.remove_incident('key-existing-001');

      expect(server.calls).toEqual([{ name: 'remove_incident', args: ['report-1', 'srv-9'] }]);
      expect(sync.report()?.incidents).toEqual([]);
    });

    it('hides a removed card at once', async () => {
      const { sync, server } = setup({
        report: make_report({
          incidents: [make_incident({ idempotency_key: 'key-existing-001' })],
        }),
      });
      await sync.start(server.report);
      const release = server.hold_next();

      const done = sync.remove_incident('key-existing-001');

      expect(sync.report()?.incidents).toEqual([]);
      release();
      await done;
    });

    it('cancels a card still waiting to be sent when it is removed, so nothing is sent for it', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();
      const scores = sync.set_scores(1, 0);

      void sync.add_incident(card('key-cancelled-001'));
      expect(sync.pending_count()).toBe(2);
      void sync.remove_incident('key-cancelled-001');

      expect(sync.pending_count()).toBe(1);
      expect(sync.report()?.incidents).toEqual([]);
      release();
      await scores;
      expect(server.names()).toEqual(['set_scores']);
    });

    it('waits for a card already in flight, then removes it by the id the server gave', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const added = sync.add_incident(card('key-inflight-0001'));
      void sync.remove_incident('key-inflight-0001');
      expect(sync.pending_count()).toBe(2);
      expect(sync.report()?.incidents).toEqual([]);
      release();
      await added;

      expect(server.calls.map((call) => call.name)).toEqual(['add_incident', 'remove_incident']);
      expect(server.calls[1].args).toEqual(['report-1', 'srv-1']);
      expect(server.report.incidents).toEqual([]);
      expect(sync.report()?.incidents).toEqual([]);
    });

    it('puts a card back by cancelling its removal when the removal has not been sent yet (Undo)', async () => {
      const incident = make_incident({ idempotency_key: 'key-undo-0000001' });
      const { sync, server } = setup({ report: make_report({ incidents: [incident] }) });
      await sync.start(server.report);
      const release = server.hold_next();
      const scores = sync.set_scores(1, 0);

      void sync.remove_incident('key-undo-0000001');
      expect(sync.report()?.incidents).toEqual([]);
      void sync.restore_incident(incident);

      expect(sync.pending_count()).toBe(1);
      expect(sync.report()?.incidents.map((item) => item.idempotency_key)).toEqual([
        'key-undo-0000001',
      ]);
      release();
      await scores;
      expect(server.names()).toEqual(['set_scores']);
    });

    it('puts a card back as a NEW card under a NEW key once its removal was sent (Undo)', async () => {
      const incident = make_incident({
        incident_id: 'srv-9',
        idempotency_key: 'key-undo-0000002',
        jersey_number: 12,
        minute: 55,
        reason_code: 'DISSENT',
      });
      const { sync, server } = setup({ report: make_report({ incidents: [incident] }) });
      await sync.start(server.report);
      await sync.remove_incident('key-undo-0000002');

      await sync.restore_incident(incident);

      expect(server.names()).toEqual(['remove_incident', 'add_incident']);
      const sent = server.calls[1].args[1] as IAddIncidentRequest;
      expect(sent.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
      expect(sent.idempotency_key).not.toBe('key-undo-0000002');
      expect(sent).toMatchObject({ jersey_number: 12, minute: 55, reason_code: 'DISSENT' });
      expect(server.report.incidents).toHaveLength(1);
    });

    it('does nothing to put a card back when the report is not editable', async () => {
      const { sync, server } = setup({ report: make_report({ status: ReportStatus.READY }) });
      await sync.start(server.report);

      await sync.restore_incident(make_incident());

      expect(server.calls).toEqual([]);
    });
  });

  describe('card ids that only the server gives', () => {
    it('(a) cancels both a card still waiting to be sent and its removal, and sends nothing at all', async () => {
      const { sync, server, set_online } = setup({ online: false });
      await sync.start(make_report());

      void sync.add_incident(card('key-never-sent-02'));
      void sync.remove_incident('key-never-sent-02');
      expect(sync.pending_count()).toBe(0);
      set_online(true);
      await new Promise((resolve) => setTimeout(resolve));

      expect(server.calls).toEqual([]);
      expect(sync.report()?.incidents).toEqual([]);
      expect(read_queue_record('report-1')).toBeNull();
    });

    it('(a) cancels a card whose first send failed and is waiting to retry, so the retry never happens', async () => {
      vi.useFakeTimers();
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [new HttpErrorResponse({ status: 0 })];
      await sync.add_incident(card('key-failed-once-1'));
      expect(sync.pending_count()).toBe(1);

      await sync.remove_incident('key-failed-once-1');
      await vi.advanceTimersByTimeAsync(60_000);

      expect(sync.pending_count()).toBe(0);
      expect(server.names()).toEqual(['add_incident']);
    });

    it('(b) sends a removal only once the card’s server id is known, and then with that id', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const added = sync.add_incident(card('key-id-known-0001'));
      void sync.remove_incident('key-id-known-0001');
      await Promise.resolve();
      expect(server.names()).toEqual(['add_incident']);
      release();
      await added;

      expect(server.names()).toEqual(['add_incident', 'remove_incident']);
      const [report_id, incident_id] = server.calls[1].args as string[];
      expect(report_id).toBe('report-1');
      expect(incident_id).toBe('srv-1');
      expect(incident_id.startsWith('local-')).toBe(false);
    });

    it('(b) never sends a local id: a removal for a card the server has not got sends nothing', async () => {
      const { sync, server, set_online } = setup({ online: false });
      await sync.start(make_report());
      write_queue_record({
        report_id: 'report-1',
        revision: 0,
        last_seq: 2,
        queue: [
          {
            kind: ReportOperationKind.REMOVE_INCIDENT,
            seq: 2,
            idempotency_key: 'key-no-server-id',
          },
        ],
      });
      await sync.start(make_report());

      set_online(true);
      await vi.waitFor(() => expect(sync.pending_count()).toBe(0));

      expect(server.names()).not.toContain('remove_incident');
    });

    it('(c) never replays a card the referee already removed: a failed send of it, with its removal behind it, drops both', async () => {
      vi.useFakeTimers();
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next(new HttpErrorResponse({ status: 0 }));

      const added = sync.add_incident(card('key-removed-late'));
      void sync.remove_incident('key-removed-late');
      expect(sync.pending_count()).toBe(2);
      release();
      await added;
      await vi.advanceTimersByTimeAsync(120_000);

      expect(sync.pending_count()).toBe(0);
      expect(server.names()).toEqual(['add_incident']);
      expect(sync.report()?.incidents).toEqual([]);
      expect(read_queue_record('report-1')).toBeNull();
    });

    it('(c) still sends a card once and then removes it when the first send succeeds', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();

      const added = sync.add_incident(card('key-acknowledged-1'));
      void sync.remove_incident('key-acknowledged-1');
      release();
      await added;

      expect(server.names()).toEqual(['add_incident', 'remove_incident']);
      expect(server.report.incidents).toEqual([]);
    });

    it('gives a card a new key and sends it once more when the server says the key belongs to another report', async () => {
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      server.failures = [make_api_error(409, 'IDEMPOTENCY_KEY_CONFLICT')];

      await sync.add_incident(card('key-clash-0000001'));

      expect(server.names()).toEqual(['add_incident', 'add_incident']);
      const first = server.calls[0].args[1] as IAddIncidentRequest;
      const second = server.calls[1].args[1] as IAddIncidentRequest;
      expect(first.idempotency_key).toBe('key-clash-0000001');
      expect(second.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
      expect(second.idempotency_key).not.toBe(first.idempotency_key);
      expect(server.report.incidents).toHaveLength(1);
      expect(sync.pending_count()).toBe(0);
      expect(dropped).toEqual([]);
    });

    it('follows a card’s new key with a removal queued behind it', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next(make_api_error(409, 'IDEMPOTENCY_KEY_CONFLICT'));

      const added = sync.add_incident(card('key-clash-0000002'));
      void sync.remove_incident('key-clash-0000002');
      release();
      await added;

      expect(server.names()).toEqual(['add_incident', 'add_incident', 'remove_incident']);
      expect(server.report.incidents).toEqual([]);
    });

    it('gives up, and says so, if the new key is refused as well', async () => {
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      server.failures = [
        make_api_error(409, 'IDEMPOTENCY_KEY_CONFLICT'),
        make_api_error(409, 'IDEMPOTENCY_KEY_CONFLICT'),
      ];

      await sync.add_incident(card('key-clash-0000003'));

      expect(server.names()).toEqual(['add_incident', 'add_incident']);
      expect(dropped).toEqual([
        {
          kind: ReportOperationKind.ADD_INCIDENT,
          reason: ReportErrorKind.GENERIC,
          code: 'IDEMPOTENCY_KEY_CONFLICT',
        },
      ]);
      expect(sync.pending_count()).toBe(0);
    });

    it('retries a 409 REPORT_CONFLICT with a pause, like a server error', async () => {
      vi.useFakeTimers();
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      server.failures = [make_api_error(409, 'REPORT_CONFLICT')];

      await sync.set_scores(1, 0);
      expect(sync.save_state()).toBe(SaveState.RETRYING);
      await vi.advanceTimersByTimeAsync(1000);

      expect(server.names()).toEqual(['set_scores', 'set_scores']);
      expect(sync.pending_count()).toBe(0);
      expect(dropped).toEqual([]);
    });

    it('surfaces TOO_MANY_INCIDENTS as a refusal and drops the card', async () => {
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      server.failures = [make_api_error(409, 'TOO_MANY_INCIDENTS')];

      await sync.add_incident(card('key-too-many-0001'));

      expect(dropped).toEqual([
        {
          kind: ReportOperationKind.ADD_INCIDENT,
          reason: ReportErrorKind.GENERIC,
          code: 'TOO_MANY_INCIDENTS',
        },
      ]);
      expect(sync.report()?.incidents).toEqual([]);
    });
  });

  describe('more about cards', () => {
    it('does nothing for a card that is not on the report', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());

      await sync.remove_incident('key-unknown-00001');

      expect(server.calls).toEqual([]);
      expect(sync.pending_count()).toBe(0);
    });

    it('skips the request for a removal whose card the server never got', async () => {
      write_queue_record({
        report_id: 'report-1',
        revision: 0,
        last_seq: 1,
        queue: [
          {
            kind: ReportOperationKind.REMOVE_INCIDENT,
            seq: 1,
            idempotency_key: 'key-never-sent-01',
          },
        ],
      });
      const { sync, server, set_online } = setup({ online: false });
      await sync.start(make_report());
      expect(sync.pending_count()).toBe(1);

      set_online(true);
      await vi.waitFor(() => expect(sync.pending_count()).toBe(0));

      expect(server.calls).toEqual([]);
    });
  });

  describe('retrying', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('keeps an edit when the server cannot be reached and tries again after a second', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [new HttpErrorResponse({ status: 0 })];

      await sync.set_scores(1, 0);

      expect(server.calls).toHaveLength(1);
      expect(sync.pending_count()).toBe(1);
      expect(sync.save_state()).toBe(SaveState.RETRYING);
      await vi.advanceTimersByTimeAsync(999);
      expect(server.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(server.calls).toHaveLength(2);
      expect(sync.pending_count()).toBe(0);
      expect(sync.save_state()).toBe(SaveState.SAVED);
      expect(sync.report()?.home_score).toBe(1);
    });

    it('doubles the wait after each failure, up to thirty seconds', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = Array.from({ length: 7 }, () => new HttpErrorResponse({ status: 503 }));

      await sync.set_scores(1, 0);
      for (const wait of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
        const before = server.calls.length;
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(server.calls.length, `before ${wait} ms`).toBe(before);
        await vi.advanceTimersByTimeAsync(1);
        expect(server.calls.length, `after ${wait} ms`).toBe(before + 1);
      }

      expect(server.calls).toHaveLength(8);
      expect(sync.pending_count()).toBe(0);
    });

    it.each([500, 502, 408, 429])('retries on status %i', async (status) => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [new HttpErrorResponse({ status })];

      await sync.set_scores(1, 0);
      await vi.advanceTimersByTimeAsync(1000);

      expect(server.calls).toHaveLength(2);
      expect(sync.pending_count()).toBe(0);
      expect(logged).not.toHaveBeenCalled();
    });

    it('tries at once when the referee edits again, instead of waiting out the pause', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [new HttpErrorResponse({ status: 0 })];
      await sync.set_scores(1, 0);

      await sync.set_scores(2, 0);

      expect(server.calls).toHaveLength(2);
      expect(sync.pending_count()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(server.calls).toHaveLength(2);
    });

    it('starts the wait over after an edit gets through', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [
        new HttpErrorResponse({ status: 0 }),
        new HttpErrorResponse({ status: 0 }),
      ];
      await sync.set_scores(1, 0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(sync.pending_count()).toBe(0);

      server.failures = [new HttpErrorResponse({ status: 0 })];
      await sync.set_scores(2, 0);
      const before = server.calls.length;
      await vi.advanceTimersByTimeAsync(999);
      expect(server.calls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(1);

      expect(server.calls.length).toBe(before + 1);
    });
  });

  describe('refusals', () => {
    it('drops an edit the server refuses for good, says so, and carries on with the next', async () => {
      const { sync, server, dropped, set_online } = setup({ online: false });
      await sync.start(make_report());
      void sync.add_incident(card('key-refused-00001'));
      void sync.set_scores(2, 1);
      server.failures = [make_api_error(400, 'VALIDATION_ERROR')];

      set_online(true);
      await vi.waitFor(() => expect(sync.pending_count()).toBe(0));

      expect(server.names()).toEqual(['add_incident', 'set_scores']);
      expect(dropped).toEqual([
        {
          kind: ReportOperationKind.ADD_INCIDENT,
          reason: ReportErrorKind.GENERIC,
          code: 'VALIDATION_ERROR',
        },
      ]);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(sync.report()?.incidents).toEqual([]);
      expect(sync.report()).toMatchObject({ home_score: 2, away_score: 1 });
    });

    it('does not send a refused edit again', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [make_api_error(404, 'NOT_FOUND')];

      await sync.set_scores(1, 0);
      await sync.flush();

      expect(server.calls).toHaveLength(1);
      expect(sync.pending_count()).toBe(0);
    });

    it('reports a locked report, and refreshes from the server instead of trusting its own copy', async () => {
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      // Another device marked it ready.
      server.report = {
        ...server.report,
        status: ReportStatus.READY,
        home_score: 5,
        away_score: 5,
      };

      await sync.set_scores(1, 0);

      expect(dropped).toEqual([
        {
          kind: ReportOperationKind.SET_SCORES,
          reason: ReportErrorKind.GENERIC,
          code: 'REPORT_NOT_EDITABLE',
        },
      ]);
      expect(server.names()).toEqual(['set_scores', 'get_report']);
      expect(sync.report()).toMatchObject({ status: ReportStatus.READY, home_score: 5 });
      expect(sync.is_editable()).toBe(false);
    });

    it('still works when the refresh after a locked report fails', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      server.report = { ...server.report, status: ReportStatus.READY };
      server.failures = [null, new HttpErrorResponse({ status: 0 })];

      await sync.set_scores(1, 0);

      expect(server.names()).toEqual(['set_scores', 'get_report']);
      expect(sync.pending_count()).toBe(0);
      expect(logged).toHaveBeenCalledTimes(2);
    });

    it('drops an error that is not an HTTP answer rather than retrying a bug forever', async () => {
      const { sync, server, dropped } = setup();
      await sync.start(make_report());
      server.failures = [new TypeError('x is not a function')];

      await sync.set_scores(1, 0);

      expect(sync.pending_count()).toBe(0);
      expect(dropped).toHaveLength(1);
      expect(logged).toHaveBeenCalled();
    });
  });

  describe('going offline and coming back', () => {
    it('keeps edits while the device is offline, says so, and sends nothing', async () => {
      const { sync, server } = setup({ online: false });
      await sync.start(make_report());

      void sync.set_scores(1, 0);
      void sync.add_incident(card('key-offline-00001'));

      expect(sync.pending_count()).toBe(2);
      expect(sync.save_state()).toBe(SaveState.OFFLINE);
      expect(server.calls).toEqual([]);
      expect(sync.report()).toMatchObject({ home_score: 1 });
      expect(sync.report()?.incidents).toHaveLength(1);
    });

    it('sends the waiting edits in order, once each, when the browser comes back online', async () => {
      const { sync, server, set_online } = setup({ online: false });
      await sync.start(make_report());
      void sync.set_scores(1, 0);
      void sync.add_incident(card('key-offline-00001'));
      void sync.set_scores(2, 0);

      set_online(true);
      await vi.waitFor(() => expect(sync.pending_count()).toBe(0));

      expect(server.names()).toEqual(['set_scores', 'add_incident', 'set_scores']);
      expect(sync.save_state()).toBe(SaveState.SAVED);
      expect(server.report.incidents).toHaveLength(1);
      expect(sync.report()).toMatchObject({ home_score: 2, away_score: 0 });
    });

    it('notices when the signal goes', async () => {
      const { sync, server, set_online } = setup();
      await sync.start(make_report());
      set_online(false);

      void sync.set_scores(1, 0);

      expect(sync.save_state()).toBe(SaveState.OFFLINE);
      expect(server.calls).toEqual([]);
    });

    it('listens for online and offline with named handlers and removes the very same ones', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      setup();

      const added = new Map(
        add.mock.calls
          .filter(([type]) => type === 'online' || type === 'offline')
          .map(([type, handler]) => [type, handler]),
      );
      expect([...added.keys()].sort()).toEqual(['offline', 'online']);
      expect(remove).not.toHaveBeenCalledWith('online', expect.anything());

      TestBed.resetTestingModule();

      expect(remove).toHaveBeenCalledWith('online', added.get('online'));
      expect(remove).toHaveBeenCalledWith('offline', added.get('offline'));
    });

    it('ignores the browser coming back after the screen is gone', async () => {
      const { sync, server, set_online } = setup({ online: false });
      await sync.start(make_report());
      void sync.set_scores(1, 0);

      TestBed.resetTestingModule();
      set_online(true);
      await new Promise((resolve) => setTimeout(resolve));

      expect(server.calls).toEqual([]);
    });

    it('stops its retry timer when the screen is gone', async () => {
      vi.useFakeTimers();
      const { sync, server } = setup();
      await sync.start(make_report());
      server.failures = [new HttpErrorResponse({ status: 0 })];
      await sync.set_scores(1, 0);

      TestBed.resetTestingModule();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(server.calls).toHaveLength(1);
    });
  });

  describe('keeping edits across a reload', () => {
    it('keeps waiting edits in browser storage under the report’s id, and clears them once sent', async () => {
      const { sync, set_online } = setup({ online: false });
      await sync.start(make_report());

      void sync.set_scores(3, 2);

      expect(read_queue_record('report-1')?.queue).toEqual([
        expect.objectContaining({ kind: ReportOperationKind.SET_SCORES, home_score: 3 }),
      ]);
      set_online(true);
      await vi.waitFor(() => expect(sync.pending_count()).toBe(0));
      expect(read_queue_record('report-1')).toBeNull();
    });

    it('keeps another report’s waiting edits apart', async () => {
      const { sync } = setup({ online: false });
      await sync.start(make_report({ report_id: 'report-A' }));

      void sync.set_scores(1, 1);

      expect(read_queue_record('report-A')?.queue).toHaveLength(1);
      expect(read_queue_record('report-B')).toBeNull();
    });

    it('still works with browser storage blocked, only without surviving a reload', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const { sync, server } = setup();

      await sync.start(make_report());
      await sync.set_scores(2, 1);

      expect(server.report).toMatchObject({ home_score: 2, away_score: 1 });
      expect(sync.pending_count()).toBe(0);
    });
  });

  describe('finishing', () => {
    it('will not mark the report ready while an edit is waiting', async () => {
      const { sync, server } = setup({ online: false });
      await sync.start(make_report());
      void sync.set_scores(1, 0);

      await sync.mark_ready();

      expect(server.calls).toEqual([]);
      expect(sync.report()?.status).toBe(ReportStatus.DRAFT);
    });

    it('marks a complete report ready', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      await sync.set_scores(2, 1);

      await sync.mark_ready();

      expect(server.names()).toEqual(['set_scores', 'mark_ready']);
      expect(sync.report()?.status).toBe(ReportStatus.READY);
      expect(sync.is_editable()).toBe(false);
    });

    it('lets the server’s refusal reach the caller and leaves the report a draft', async () => {
      const { sync } = setup();
      await sync.start(make_report());

      const error = await sync.mark_ready().then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(422);
      expect(sync.report()?.status).toBe(ReportStatus.DRAFT);
    });

    it('opens a ready report for editing again', async () => {
      const { sync, server } = setup({ report: make_report({ status: ReportStatus.READY }) });
      await sync.start(server.report);

      await sync.reopen();

      expect(sync.report()?.status).toBe(ReportStatus.DRAFT);
      expect(sync.is_editable()).toBe(true);
    });

    it('will not reopen while an edit is waiting, and does nothing before a report is started', async () => {
      const { sync, server } = setup({ online: false });
      await sync.mark_ready();
      await sync.reopen();
      await sync.start(make_report());
      void sync.set_scores(1, 0);

      await sync.reopen();

      expect(server.calls).toEqual([]);
    });
  });

  describe('flushing', () => {
    it('does not send an edit twice when flushed again while it is in flight', async () => {
      const { sync, server } = setup();
      await sync.start(make_report());
      const release = server.hold_next();
      const first = sync.set_scores(1, 0);

      await sync.flush();
      await sync.flush();
      release();
      await first;

      expect(server.calls).toHaveLength(1);
    });
  });
});
