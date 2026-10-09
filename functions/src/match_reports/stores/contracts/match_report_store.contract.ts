import { describe, expect, it } from 'vitest';
import { IncidentType } from '../../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../../domain/match_reports/team_side.enum.js';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { MatchReportWriteOutcome } from '../../enums/match_report_write_outcome.enum.js';
import { IStoredMatchIncident } from '../../models/stored_match_incident.model.js';
import { IMatchReportStore } from '../../ports/match_report_store.interface.js';
import {
  make_contract_edit,
  make_contract_incident,
  make_contract_match_report,
} from './make_contract_match_report.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Registers the behavioural contract every `IMatchReportStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_match_report_store_contract(
  label: string,
  make: () => IMatchReportStore,
): void {
  describe(`${label} match report store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('create_report_if_absent, get_report and get_report_by_game', () => {
      it('stores a new report and round-trips every field', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = make_contract_match_report(tenant_id, 'r1', {
          game_id: 'game-9',
          status: MatchReportStatus.DRAFT,
          home_score: 3,
          away_score: 0,
          notes: 'Calm game, one "heated" moment\nsecond line, with ünïcode',
          client_revision: 4,
          lock_version: 2,
          created_at: 1786234970000,
          created_by: 'creator',
          updated_at: 1786234980000,
          updated_by: 'updater',
        });

        const created = await store.create_report_if_absent(report);

        expect(created).toEqual({ report, created: true });
        expect(await store.get_report(tenant_id, 'r1')).toEqual(report);
        expect(await store.get_report_by_game(tenant_id, 'game-9')).toEqual(report);
      });

      it('round-trips null scores and notes', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_report_if_absent(make_contract_match_report(tenant_id, 'r1'));

        const stored = await store.get_report(tenant_id, 'r1');

        expect(stored).toMatchObject({ home_score: null, away_score: null, notes: null });
        expect(stored?.incidents).toEqual([]);
      });

      it('returns the report the game already has and changes nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const first = make_contract_match_report(tenant_id, 'r1', {
          game_id: 'g1',
          notes: 'first',
        });
        await store.create_report_if_absent(first);

        const second = await store.create_report_if_absent(
          make_contract_match_report(tenant_id, 'r2', { game_id: 'g1', notes: 'second' }),
        );

        expect(second).toEqual({ report: first, created: false });
        expect(await store.get_report(tenant_id, 'r2')).toBeNull();
        expect(await store.get_report(tenant_id, 'r1')).toEqual(first);
      });

      it('lets exactly one of several simultaneous creators win', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        const results = await Promise.all(
          ['r1', 'r2', 'r3'].map((report_id) =>
            store.create_report_if_absent(
              make_contract_match_report(tenant_id, report_id, { game_id: 'g1' }),
            ),
          ),
        );

        expect(results.filter((result) => result.created)).toHaveLength(1);
        const winner = results.find((result) => result.created)!.report;
        for (const result of results) {
          expect(result.report.report_id).toBe(winner.report_id);
        }
        expect((await store.get_report_by_game(tenant_id, 'g1'))?.report_id).toBe(winner.report_id);
      });

      it('keeps tenants apart even for the same report and game ids', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();

        const a = await store.create_report_if_absent(
          make_contract_match_report(tenant_a, 'r1', { game_id: 'g1', notes: 'a' }),
        );
        const b = await store.create_report_if_absent(
          make_contract_match_report(tenant_b, 'r1', { game_id: 'g1', notes: 'b' }),
        );

        expect(a.created).toBe(true);
        expect(b.created).toBe(true);
        expect((await store.get_report(tenant_a, 'r1'))?.notes).toBe('a');
        expect((await store.get_report(tenant_b, 'r1'))?.notes).toBe('b');
      });

      it('returns null for an unknown report or game, and for another tenant', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_report_if_absent(
          make_contract_match_report(tenant_id, 'r1', { game_id: 'g1' }),
        );
        const other = make_contract_tenant_id();

        expect(await store.get_report(tenant_id, 'nope')).toBeNull();
        expect(await store.get_report_by_game(tenant_id, 'nope')).toBeNull();
        expect(await store.get_report(other, 'r1')).toBeNull();
        expect(await store.get_report_by_game(other, 'g1')).toBeNull();
      });

      it('returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const created = await store.create_report_if_absent(
          make_contract_match_report(tenant_id, 'r1'),
        );
        created.report.notes = 'mutated';
        const read = await store.get_report(tenant_id, 'r1');
        read!.notes = 'mutated again';

        expect((await store.get_report(tenant_id, 'r1'))?.notes).toBeNull();
      });
    });

    describe('list_reports', () => {
      const ANY = { status: null, game_id: null, limit: 200 };

      it('lists a tenant newest first, breaking ties by report id descending', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        for (const [report_id, created_at] of [
          ['r1', 1000],
          ['r2', 3000],
          ['r3', 2000],
          ['r4', 3000],
        ] as const) {
          await store.create_report_if_absent(
            make_contract_match_report(tenant_id, report_id, { created_at }),
          );
        }

        const listed = await store.list_reports(tenant_id, ANY);

        expect(listed.map((report) => report.report_id)).toEqual(['r4', 'r2', 'r3', 'r1']);
      });

      it('filters by status and by game', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_report_if_absent(make_contract_match_report(tenant_id, 'r1'));
        await store.create_report_if_absent(
          make_contract_match_report(tenant_id, 'r2', { status: MatchReportStatus.READY }),
        );
        await store.create_report_if_absent(make_contract_match_report(tenant_id, 'r3'));

        const ready = await store.list_reports(tenant_id, {
          ...ANY,
          status: MatchReportStatus.READY,
        });
        const one_game = await store.list_reports(tenant_id, { ...ANY, game_id: 'game-r3' });
        const none = await store.list_reports(tenant_id, {
          ...ANY,
          status: MatchReportStatus.READY,
          game_id: 'game-r1',
        });

        expect(ready.map((report) => report.report_id)).toEqual(['r2']);
        expect(one_game.map((report) => report.report_id)).toEqual(['r3']);
        expect(none).toEqual([]);
      });

      it('caps the result at the limit and returns nothing for a limit below one', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        for (const report_id of ['r1', 'r2', 'r3']) {
          await store.create_report_if_absent(
            make_contract_match_report(tenant_id, report_id, {
              created_at: Number(report_id.slice(1)),
            }),
          );
        }

        const capped = await store.list_reports(tenant_id, { ...ANY, limit: 2 });

        expect(capped.map((report) => report.report_id)).toEqual(['r3', 'r2']);
        expect(await store.list_reports(tenant_id, { ...ANY, limit: 0 })).toEqual([]);
      });

      it("never lists another tenant's reports", async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.create_report_if_absent(make_contract_match_report(tenant_a, 'r1'));
        await store.create_report_if_absent(make_contract_match_report(tenant_b, 'r2'));

        expect((await store.list_reports(tenant_a, ANY)).map((r) => r.report_id)).toEqual(['r1']);
        expect(await store.list_reports(make_contract_tenant_id(), ANY)).toEqual([]);
      });

      it('includes each report with its own incidents, oldest first', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const r1 = make_contract_match_report(tenant_id, 'r1', { created_at: 1 });
        const r2 = make_contract_match_report(tenant_id, 'r2', { created_at: 2 });
        await store.create_report_if_absent(r1);
        await store.create_report_if_absent(r2);
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(r1, {
            add_incident: make_contract_incident('i-b', { created_at: 20 }),
          }),
          5000,
          'me',
        );
        await store.apply_edit(
          tenant_id,
          'r1',
          1,
          make_contract_edit(r1, {
            add_incident: make_contract_incident('i-a', { created_at: 10 }),
          }),
          5001,
          'me',
        );
        await store.apply_edit(
          tenant_id,
          'r2',
          0,
          make_contract_edit(r2, {
            add_incident: make_contract_incident('i-c', { created_at: 5 }),
          }),
          5002,
          'me',
        );

        const listed = await store.list_reports(tenant_id, ANY);

        expect(listed.map((report) => report.incidents.map((i) => i.incident_id))).toEqual([
          ['i-c'],
          ['i-a', 'i-b'],
        ]);
      });
    });

    describe('apply_edit', () => {
      /**
       * Stores an empty report and returns it.
       * @param store Store under test.
       * @param tenant_id Owning tenant.
       * @param report_id Report id.
       * @returns The stored report.
       */
      async function seed(store: IMatchReportStore, tenant_id: string, report_id = 'r1') {
        const report = make_contract_match_report(tenant_id, report_id);
        await store.create_report_if_absent(report);
        return report;
      }

      it('saves the new field values, moves lock_version up by one and stamps the editor', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);

        const result = await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, {
            status: MatchReportStatus.READY,
            home_score: 2,
            away_score: 1,
            notes: 'Done',
            client_revision: 5,
          }),
          9000,
          'editor',
        );

        expect(result.outcome).toBe(MatchReportWriteOutcome.APPLIED);
        expect(result.report).toEqual({
          ...report,
          status: MatchReportStatus.READY,
          home_score: 2,
          away_score: 1,
          notes: 'Done',
          client_revision: 5,
          lock_version: 1,
          updated_at: 9000,
          updated_by: 'editor',
        });
        expect(await store.get_report(tenant_id, 'r1')).toEqual(result.report);
      });

      it('can clear scores and notes back to null', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, { home_score: 1, away_score: 1, notes: 'x' }),
          2000,
          'me',
        );

        await store.apply_edit(
          tenant_id,
          'r1',
          1,
          make_contract_edit(report, { home_score: null, away_score: null, notes: null }),
          3000,
          'me',
        );

        expect(await store.get_report(tenant_id, 'r1')).toMatchObject({
          home_score: null,
          away_score: null,
          notes: null,
          lock_version: 2,
        });
      });

      it('refuses a write based on an old lock_version and changes nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, { home_score: 1 }),
          2000,
          'first',
        );
        const before = await store.get_report(tenant_id, 'r1');

        const stale = await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, {
            home_score: 9,
            add_incident: make_contract_incident('i1'),
          }),
          3000,
          'second',
        );

        expect(stale).toEqual({ outcome: MatchReportWriteOutcome.LOST_RACE, report: null });
        expect(await store.get_report(tenant_id, 'r1')).toEqual(before);
      });

      it('lets exactly one of two simultaneous writers from the same version win', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);

        const results = await Promise.all(
          [3, 4].map((home_score) =>
            store.apply_edit(
              tenant_id,
              'r1',
              0,
              make_contract_edit(report, { home_score }),
              5000,
              `writer-${home_score}`,
            ),
          ),
        );

        const outcomes = results.map((result) => result.outcome).sort();
        expect(outcomes).toEqual([
          MatchReportWriteOutcome.APPLIED,
          MatchReportWriteOutcome.LOST_RACE,
        ]);
        const winner = results.find((result) => result.outcome === MatchReportWriteOutcome.APPLIED);
        expect((await store.get_report(tenant_id, 'r1'))?.home_score).toBe(
          winner?.report?.home_score,
        );
        expect((await store.get_report(tenant_id, 'r1'))?.lock_version).toBe(1);
      });

      it('answers NOT_FOUND for an unknown report and for another tenant, writing nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        const other = make_contract_tenant_id();

        const unknown = await store.apply_edit(
          tenant_id,
          'nope',
          0,
          make_contract_edit(report, { home_score: 5 }),
          2000,
          'me',
        );
        const foreign = await store.apply_edit(
          other,
          'r1',
          0,
          make_contract_edit(report, { home_score: 5 }),
          2000,
          'me',
        );

        expect(unknown).toEqual({ outcome: MatchReportWriteOutcome.NOT_FOUND, report: null });
        expect(foreign).toEqual({ outcome: MatchReportWriteOutcome.NOT_FOUND, report: null });
        expect(await store.get_report(tenant_id, 'r1')).toEqual(report);
      });

      it('adds an incident and round-trips every one of its fields', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        const incident = make_contract_incident('i1', {
          idempotency_key: 'Key_abc-123',
          team_side: TeamSide.AWAY,
          jersey_number: 10,
          incident_type: IncidentType.RED,
          minute: 88,
          reason_code: 'DOGSO',
          notes: 'Line one\nLine two, "quoted"',
          created_at: 1786234975000,
          created_by: 'recorder',
          updated_at: 1786234975000,
          updated_by: 'recorder',
        });

        const result = await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, { add_incident: incident }),
          9000,
          'recorder',
        );

        expect(result.outcome).toBe(MatchReportWriteOutcome.APPLIED);
        expect(result.report?.incidents).toEqual([incident]);
        expect((await store.get_report(tenant_id, 'r1'))?.incidents).toEqual([incident]);
      });

      it('round-trips an incident whose optional fields are null', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        const incident = make_contract_incident('i1', {
          jersey_number: null,
          minute: null,
          reason_code: null,
          notes: null,
          incident_type: IncidentType.OTHER,
        });

        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, { add_incident: incident }),
          9000,
          'me',
        );

        expect((await store.get_report(tenant_id, 'r1'))?.incidents).toEqual([incident]);
      });

      it('returns incidents oldest first, breaking ties by incident id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        const added: [string, number][] = [
          ['i-z', 300],
          ['i-b', 100],
          ['i-a', 100],
          ['i-m', 200],
        ];
        for (const [index, [incident_id, created_at]] of added.entries()) {
          await store.apply_edit(
            tenant_id,
            'r1',
            index,
            make_contract_edit(report, {
              add_incident: make_contract_incident(incident_id, { created_at }),
            }),
            5000,
            'me',
          );
        }

        const ids = (await store.get_report(tenant_id, 'r1'))?.incidents.map((i) => i.incident_id);

        expect(ids).toEqual(['i-a', 'i-b', 'i-m', 'i-z']);
      });

      it('refuses an idempotency key already used on another report of the tenant, writing nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const r1 = await seed(store, tenant_id, 'r1');
        const r2 = await seed(store, tenant_id, 'r2');
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(r1, {
            add_incident: make_contract_incident('i1', { idempotency_key: 'shared-key-1' }),
          }),
          2000,
          'me',
        );

        const result = await store.apply_edit(
          tenant_id,
          'r2',
          0,
          make_contract_edit(r2, {
            home_score: 6,
            add_incident: make_contract_incident('i2', { idempotency_key: 'shared-key-1' }),
          }),
          3000,
          'me',
        );

        expect(result).toEqual({
          outcome: MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT,
          report: null,
        });
        expect(await store.get_report(tenant_id, 'r2')).toEqual(r2);
        expect((await store.get_report(tenant_id, 'r1'))?.incidents).toHaveLength(1);
      });

      it('refuses an idempotency key already used on the same report too', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, {
            add_incident: make_contract_incident('i1', { idempotency_key: 'same-key-1' }),
          }),
          2000,
          'me',
        );

        const result = await store.apply_edit(
          tenant_id,
          'r1',
          1,
          make_contract_edit(report, {
            add_incident: make_contract_incident('i2', { idempotency_key: 'same-key-1' }),
          }),
          3000,
          'me',
        );

        expect(result.outcome).toBe(MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT);
        expect((await store.get_report(tenant_id, 'r1'))?.incidents).toHaveLength(1);
      });

      it('allows the same idempotency key in different tenants', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        const a = await seed(store, tenant_a);
        const b = await seed(store, tenant_b);
        const incident = make_contract_incident('i1', { idempotency_key: 'both-tenants-1' });

        const first = await store.apply_edit(
          tenant_a,
          'r1',
          0,
          make_contract_edit(a, { add_incident: incident }),
          2000,
          'me',
        );
        const second = await store.apply_edit(
          tenant_b,
          'r1',
          0,
          make_contract_edit(b, { add_incident: incident }),
          2000,
          'me',
        );

        expect(first.outcome).toBe(MatchReportWriteOutcome.APPLIED);
        expect(second.outcome).toBe(MatchReportWriteOutcome.APPLIED);
      });

      it('removes only the named incident and frees its idempotency key', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        for (const [index, incident_id] of ['i1', 'i2'].entries()) {
          await store.apply_edit(
            tenant_id,
            'r1',
            index,
            make_contract_edit(report, {
              add_incident: make_contract_incident(incident_id, { created_at: 2000 + index }),
            }),
            5000,
            'me',
          );
        }

        const removed = await store.apply_edit(
          tenant_id,
          'r1',
          2,
          make_contract_edit(report, { remove_incident_id: 'i1' }),
          6000,
          'me',
        );
        const reused = await store.apply_edit(
          tenant_id,
          'r1',
          3,
          make_contract_edit(report, {
            add_incident: make_contract_incident('i3', { idempotency_key: 'key-i1' }),
          }),
          7000,
          'me',
        );

        expect(removed.report?.incidents.map((i) => i.incident_id)).toEqual(['i2']);
        expect(reused.outcome).toBe(MatchReportWriteOutcome.APPLIED);
        expect(
          (await store.get_report(tenant_id, 'r1'))?.incidents.map((i) => i.incident_id).sort(),
        ).toEqual(['i2', 'i3']);
      });

      it('treats removing an unknown incident as no change to the incidents, while the fields are still saved', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(report, { add_incident: make_contract_incident('i1') }),
          2000,
          'me',
        );

        const result = await store.apply_edit(
          tenant_id,
          'r1',
          1,
          make_contract_edit(report, { home_score: 4, remove_incident_id: 'nope' }),
          3000,
          'me',
        );

        expect(result.outcome).toBe(MatchReportWriteOutcome.APPLIED);
        expect(result.report?.incidents.map((i) => i.incident_id)).toEqual(['i1']);
        expect(result.report?.home_score).toBe(4);
      });

      it("does not remove another report's incident that has the same incident id", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const r1 = await seed(store, tenant_id, 'r1');
        const r2 = await seed(store, tenant_id, 'r2');
        await store.apply_edit(
          tenant_id,
          'r1',
          0,
          make_contract_edit(r1, {
            add_incident: make_contract_incident('i1', { idempotency_key: 'key-r1-i1' }),
          }),
          2000,
          'me',
        );
        await store.apply_edit(
          tenant_id,
          'r2',
          0,
          make_contract_edit(r2, {
            add_incident: make_contract_incident('i1', { idempotency_key: 'key-r2-i1' }),
          }),
          2000,
          'me',
        );

        await store.apply_edit(
          tenant_id,
          'r1',
          1,
          make_contract_edit(r1, { remove_incident_id: 'i1' }),
          3000,
          'me',
        );

        expect((await store.get_report(tenant_id, 'r1'))?.incidents).toEqual([]);
        expect((await store.get_report(tenant_id, 'r2'))?.incidents).toHaveLength(1);
      });

      it('refuses to store an incident without a team side and writes nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const report = await seed(store, tenant_id);
        const sideless = {
          ...make_contract_incident('i1'),
          team_side: null,
        } as unknown as IStoredMatchIncident;

        await expect(
          store.apply_edit(
            tenant_id,
            'r1',
            0,
            make_contract_edit(report, { home_score: 8, add_incident: sideless }),
            2000,
            'me',
          ),
        ).rejects.toThrow(/team side/);

        expect(await store.get_report(tenant_id, 'r1')).toEqual(report);
      });
    });
  });
}
