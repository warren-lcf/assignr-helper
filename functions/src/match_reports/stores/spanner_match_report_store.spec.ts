import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { MatchReportWriteOutcome } from '../enums/match_report_write_outcome.enum.js';
import { IStoredMatchIncident } from '../models/stored_match_incident.model.js';
import { describe_match_report_store_contract } from './contracts/match_report_store.contract.js';
import {
  make_contract_edit,
  make_contract_incident,
  make_contract_match_report,
} from './contracts/make_contract_match_report.js';
import { SpannerMatchReportStore } from './spanner_match_report_store.js';

/** One request the fake database received. */
interface IRecordedRequest {
  sql: string;
  params: Record<string, unknown>;
  types: Record<string, unknown>;
}

/**
 * Builds a report row in the shape a JSON-mode query returns (INT64 cells arrive as text).
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_report_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    report_id: 'r1',
    game_id: 'g1',
    status: 'DRAFT',
    home_score: '2',
    away_score: null,
    notes: null,
    client_revision: '3',
    lock_version: '4',
    created_at: '1000',
    created_by: 'c',
    updated_at: '2000',
    updated_by: 'u',
    ...overrides,
  };
}

/**
 * Builds an incident row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_incident_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    report_id: 'r1',
    incident_id: 'i1',
    team_side: 'HOME',
    jersey_number: '7',
    incident_type: 'YELLOW',
    minute: null,
    reason_code: null,
    idempotency_key: 'key-i1',
    notes: null,
    created_at: '3000',
    created_by: 'c',
    updated_at: '3000',
    updated_by: 'c',
    ...overrides,
  };
}

/** What the fake database holds and how it fails. */
interface IFakeData {
  reports?: Record<string, unknown>[];
  incidents?: Record<string, unknown>[];
  key_rows?: Record<string, unknown>[];
  commit_error?: unknown;
}

/**
 * Builds a database that answers the store's queries from fixed rows and records everything the
 * store does through snapshots and transactions.
 * @param data Rows to answer with, and an optional commit failure.
 * @returns The fake and its spies.
 */
function make_fake_database(data: IFakeData = {}) {
  const requests: IRecordedRequest[] = [];
  const run = vi.fn(async (request: IRecordedRequest) => {
    requests.push(request);
    if (request.sql.includes('FROM match_report_incidents@')) return [data.key_rows ?? []];
    if (request.sql.includes('FROM match_report_incidents')) return [data.incidents ?? []];
    return [data.reports ?? []];
  });
  const end = vi.fn();
  const transaction = {
    run,
    insert: vi.fn(),
    update: vi.fn(),
    deleteRows: vi.fn(),
    commit: vi.fn(async () => {
      if (data.commit_error) throw data.commit_error;
    }),
    rollback: vi.fn(async () => undefined),
  };
  const runTransactionAsync = vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
    work(transaction),
  );
  const database = {
    getSnapshot: async () => [{ run, end }],
    runTransactionAsync,
  } as unknown as Database;
  return { database, requests, run, end, transaction, runTransactionAsync };
}

describe('SpannerMatchReportStore reads without a database round trip', () => {
  it('reads a report and its incidents by tenant and id, as bound parameters, through one snapshot', async () => {
    const fake = make_fake_database({
      reports: [make_report_row()],
      incidents: [make_incident_row()],
    });

    const report = await new SpannerMatchReportStore(fake.database).get_report('t1', 'r1');

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]?.sql).toContain(
      'WHERE tenant_id = @tenant_id AND report_id = @report_id',
    );
    expect(fake.requests[0]?.params).toEqual({ tenant_id: 't1', report_id: 'r1' });
    expect(fake.requests[1]?.sql).toContain(
      'WHERE tenant_id = @tenant_id AND report_id IN UNNEST(@report_ids)',
    );
    expect(fake.requests[1]?.params).toEqual({ tenant_id: 't1', report_ids: ['r1'] });
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({
      tenant_id: 't1',
      report_id: 'r1',
      status: MatchReportStatus.DRAFT,
      home_score: 2,
      away_score: null,
      client_revision: 3,
      lock_version: 4,
      created_at: 1000,
      updated_at: 2000,
    });
    expect(report?.incidents).toEqual([
      {
        incident_id: 'i1',
        idempotency_key: 'key-i1',
        team_side: TeamSide.HOME,
        jersey_number: 7,
        incident_type: IncidentType.YELLOW,
        minute: null,
        reason_code: null,
        notes: null,
        created_at: 3000,
        created_by: 'c',
        updated_at: 3000,
        updated_by: 'c',
      },
    ]);
  });

  it('returns null, and asks for no incidents, when there is no such report', async () => {
    const fake = make_fake_database();
    const store = new SpannerMatchReportStore(fake.database);

    expect(await store.get_report('t1', 'r1')).toBeNull();
    expect(await store.get_report_by_game('t1', 'g1')).toBeNull();
    expect(fake.requests.every((request) => !request.sql.includes('match_report_incidents'))).toBe(
      true,
    );
  });

  it('finds a game report through the unique index, binding the game id', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });

    await new SpannerMatchReportStore(fake.database).get_report_by_game('t1', 'g1');

    expect(fake.requests[0]?.sql).toContain('FORCE_INDEX=match_reports_by_game');
    expect(fake.requests[0]?.sql).toContain('WHERE tenant_id = @tenant_id AND game_id = @game_id');
    expect(fake.requests[0]?.sql).not.toContain("'g1'");
    expect(fake.requests[0]?.params).toEqual({ tenant_id: 't1', game_id: 'g1' });
  });

  it('filters every read on the tenant id', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });
    const store = new SpannerMatchReportStore(fake.database);

    await store.get_report('t1', 'r1');
    await store.get_report_by_game('t1', 'g1');
    await store.list_reports('t1', { status: null, game_id: null, limit: 5 });

    expect(fake.requests.length).toBeGreaterThan(0);
    for (const request of fake.requests) {
      expect(request.sql).toContain('tenant_id = @tenant_id');
      expect(request.params['tenant_id']).toBe('t1');
    }
  });

  it('lists with status and game filters and the limit bound as parameters, newest first', async () => {
    const fake = make_fake_database();

    await new SpannerMatchReportStore(fake.database).list_reports('t1', {
      status: MatchReportStatus.READY,
      game_id: 'g1',
      limit: 25,
    });

    const [request] = fake.requests;
    expect(request?.sql).toContain('AND status = @status');
    expect(request?.sql).toContain('AND game_id = @game_id');
    expect(request?.sql).toContain('ORDER BY created_at DESC, report_id DESC LIMIT @row_limit');
    expect(request?.sql).not.toContain('READY');
    expect(request?.params).toEqual({
      tenant_id: 't1',
      row_limit: 25,
      status: 'READY',
      game_id: 'g1',
    });
    expect(request?.types['row_limit']).toBe('int64');
  });

  it('adds no filter clauses when none are asked for', async () => {
    const fake = make_fake_database();

    await new SpannerMatchReportStore(fake.database).list_reports('t1', {
      status: null,
      game_id: null,
      limit: 25,
    });

    expect(fake.requests[0]?.sql).not.toContain('@status');
    expect(fake.requests[0]?.sql).not.toContain('@game_id');
  });

  it('returns nothing, without querying, for a limit below one', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });
    const store = new SpannerMatchReportStore(fake.database);

    expect(await store.list_reports('t1', { status: null, game_id: null, limit: 0 })).toEqual([]);
    expect(
      await store.list_reports('t1', { status: null, game_id: null, limit: Number.NaN }),
    ).toEqual([]);
    expect(fake.run).not.toHaveBeenCalled();
  });

  it('attaches incidents to their own report and sorts them oldest first', async () => {
    const fake = make_fake_database({
      reports: [make_report_row({ report_id: 'r2' }), make_report_row({ report_id: 'r1' })],
      incidents: [
        make_incident_row({ report_id: 'r1', incident_id: 'i-late', created_at: '9' }),
        make_incident_row({ report_id: 'r2', incident_id: 'i-other', created_at: '5' }),
        make_incident_row({ report_id: 'r1', incident_id: 'i-early', created_at: '1' }),
      ],
    });

    const listed = await new SpannerMatchReportStore(fake.database).list_reports('t1', {
      status: null,
      game_id: null,
      limit: 10,
    });

    expect(listed.map((report) => report.report_id)).toEqual(['r2', 'r1']);
    expect(listed.map((report) => report.incidents.map((i) => i.incident_id))).toEqual([
      ['i-other'],
      ['i-early', 'i-late'],
    ]);
  });

  it.each([['status', { status: 'ARCHIVED' }, /status/]])(
    'refuses a report row whose %s is unknown',
    async (_name, cells, message) => {
      const fake = make_fake_database({ reports: [make_report_row(cells)] });

      await expect(
        new SpannerMatchReportStore(fake.database).get_report('t1', 'r1'),
      ).rejects.toThrow(message);
    },
  );

  it.each([
    ['team_side', { team_side: 'NEITHER' }, /team_side/],
    ['null team_side', { team_side: null }, /team_side/],
    ['incident_type', { incident_type: 'PURPLE' }, /incident_type/],
  ])('refuses an incident row with a bad %s', async (_name, cells, message) => {
    const fake = make_fake_database({
      reports: [make_report_row()],
      incidents: [make_incident_row(cells)],
    });

    await expect(new SpannerMatchReportStore(fake.database).get_report('t1', 'r1')).rejects.toThrow(
      message,
    );
  });
});

describe('SpannerMatchReportStore.apply_edit without a database round trip', () => {
  const report = make_contract_match_report('t1', 'r1', { lock_version: 4 });

  it('answers NOT_FOUND and writes nothing when the report is missing', async () => {
    const fake = make_fake_database();

    const result = await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report),
      1,
      'me',
    );

    expect(result).toEqual({ outcome: MatchReportWriteOutcome.NOT_FOUND, report: null });
    expect(fake.transaction.update).not.toHaveBeenCalled();
    expect(fake.transaction.insert).not.toHaveBeenCalled();
  });

  it('compares lock_version inside the transaction and writes nothing when it moved', async () => {
    const fake = make_fake_database({ reports: [make_report_row({ lock_version: '5' })] });

    const result = await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { home_score: 9, add_incident: make_contract_incident('i9') }),
      1,
      'me',
    );

    expect(result).toEqual({ outcome: MatchReportWriteOutcome.LOST_RACE, report: null });
    expect(fake.transaction.update).not.toHaveBeenCalled();
    expect(fake.transaction.insert).not.toHaveBeenCalled();
    expect(fake.transaction.deleteRows).not.toHaveBeenCalled();
  });

  it('checks the tenant-wide idempotency key through its unique index and writes nothing when taken', async () => {
    const fake = make_fake_database({
      reports: [make_report_row()],
      key_rows: [{ report_id: 'other-report' }],
    });

    const result = await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { add_incident: make_contract_incident('i9') }),
      1,
      'me',
    );

    expect(result.outcome).toBe(MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT);
    const key_request = fake.requests.find((request) =>
      request.sql.includes('FORCE_INDEX=match_report_incidents_by_idempotency'),
    );
    expect(key_request?.sql).toContain(
      'WHERE tenant_id = @tenant_id AND idempotency_key = @idempotency_key',
    );
    expect(key_request?.params).toEqual({ tenant_id: 't1', idempotency_key: 'key-i9' });
    expect(fake.transaction.update).not.toHaveBeenCalled();
    expect(fake.transaction.insert).not.toHaveBeenCalled();
  });

  it('does not look up an idempotency key when no incident is added', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });

    await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { home_score: 1 }),
      1,
      'me',
    );

    expect(fake.requests.some((request) => request.sql.includes('FORCE_INDEX'))).toBe(false);
  });

  it('writes the report update with the next lock_version and the editor stamp, and commits once', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });

    const result = await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, {
        status: MatchReportStatus.READY,
        home_score: 3,
        away_score: 2,
        notes: 'n',
        client_revision: 8,
      }),
      7000,
      'editor',
    );

    expect(result.outcome).toBe(MatchReportWriteOutcome.APPLIED);
    expect(fake.transaction.update).toHaveBeenCalledTimes(1);
    expect(fake.transaction.update).toHaveBeenCalledWith('match_reports', {
      tenant_id: 't1',
      report_id: 'r1',
      status: 'READY',
      home_score: 3,
      away_score: 2,
      notes: 'n',
      client_revision: 8,
      lock_version: 5,
      updated_at: 7000,
      updated_by: 'editor',
    });
    expect(fake.transaction.insert).not.toHaveBeenCalled();
    expect(fake.transaction.commit).toHaveBeenCalledTimes(1);
    expect(result.report).toMatchObject({ lock_version: 5, updated_at: 7000, home_score: 3 });
  });

  it('inserts the incident row under the report in the same transaction', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });
    const incident = make_contract_incident('i9', {
      team_side: TeamSide.AWAY,
      incident_type: IncidentType.RED,
    });

    const result = await new SpannerMatchReportStore(fake.database).apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { add_incident: incident }),
      7000,
      'editor',
    );

    expect(fake.transaction.insert).toHaveBeenCalledWith('match_report_incidents', {
      tenant_id: 't1',
      report_id: 'r1',
      incident_id: 'i9',
      team_side: 'AWAY',
      jersey_number: 7,
      incident_type: 'RED',
      minute: 33,
      reason_code: 'DISSENT',
      idempotency_key: 'key-i9',
      notes: 'Late tackle',
      created_at: 2000,
      created_by: 'recorder',
      updated_at: 2000,
      updated_by: 'recorder',
    });
    expect(fake.transaction.update).toHaveBeenCalledTimes(1);
    expect(result.report?.incidents.map((i) => i.incident_id)).toEqual(['i9']);
  });

  it('deletes an incident the report holds, by its full key, and not one it does not', async () => {
    const fake = make_fake_database({
      reports: [make_report_row()],
      incidents: [make_incident_row()],
    });
    const store = new SpannerMatchReportStore(fake.database);

    const removed = await store.apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { remove_incident_id: 'i1' }),
      7000,
      'me',
    );
    expect(fake.transaction.deleteRows).toHaveBeenCalledWith('match_report_incidents', [
      ['t1', 'r1', 'i1'],
    ]);
    expect(removed.report?.incidents).toEqual([]);

    fake.transaction.deleteRows.mockClear();
    await store.apply_edit(
      't1',
      'r1',
      4,
      make_contract_edit(report, { remove_incident_id: 'ghost' }),
      7000,
      'me',
    );
    expect(fake.transaction.deleteRows).not.toHaveBeenCalled();
  });

  it('refuses an incident without a team side before opening a transaction', async () => {
    const fake = make_fake_database({ reports: [make_report_row()] });
    const sideless = {
      ...make_contract_incident('i9'),
      team_side: null,
    } as unknown as IStoredMatchIncident;

    await expect(
      new SpannerMatchReportStore(fake.database).apply_edit(
        't1',
        'r1',
        4,
        make_contract_edit(report, { add_incident: sideless }),
        1,
        'me',
      ),
    ).rejects.toThrow(/team side/);

    expect(fake.runTransactionAsync).not.toHaveBeenCalled();
  });
});

describe('SpannerMatchReportStore.create_report_if_absent without a database round trip', () => {
  const fresh = make_contract_match_report('t1', 'r1', { game_id: 'g1' });

  it('returns the report the game already has and inserts nothing', async () => {
    const fake = make_fake_database({ reports: [make_report_row({ report_id: 'older' })] });

    const result = await new SpannerMatchReportStore(fake.database).create_report_if_absent(fresh);

    expect(result.created).toBe(false);
    expect(result.report.report_id).toBe('older');
    expect(fake.transaction.insert).not.toHaveBeenCalled();
  });

  it('inserts the report when the game has none', async () => {
    const fake = make_fake_database();

    const result = await new SpannerMatchReportStore(fake.database).create_report_if_absent(fresh);

    expect(result).toEqual({ report: fresh, created: true });
    expect(fake.transaction.insert).toHaveBeenCalledWith('match_reports', {
      tenant_id: 't1',
      report_id: 'r1',
      game_id: 'g1',
      status: 'DRAFT',
      home_score: null,
      away_score: null,
      notes: null,
      client_revision: 0,
      lock_version: 0,
      created_at: 1000,
      created_by: 'creator',
      updated_at: 1000,
      updated_by: 'creator',
    });
  });

  it('answers with the winner when a simultaneous creator took the game first', async () => {
    const fake = make_fake_database({ commit_error: { code: 6 } });
    fake.run.mockImplementationOnce(async () => [[]]);
    const store = new SpannerMatchReportStore(fake.database);
    fake.run.mockImplementation(async (request: IRecordedRequest) => {
      fake.requests.push(request);
      return request.sql.includes('match_report_incidents')
        ? [[]]
        : [[make_report_row({ report_id: 'winner' })]];
    });

    const result = await store.create_report_if_absent(fresh);

    expect(result.created).toBe(false);
    expect(result.report.report_id).toBe('winner');
  });

  it('rethrows a duplicate-key failure when no report exists for the game', async () => {
    const fake = make_fake_database({ commit_error: { code: 6 } });

    await expect(
      new SpannerMatchReportStore(fake.database).create_report_if_absent(fresh),
    ).rejects.toEqual({ code: 6 });
  });

  it('rethrows any other failure', async () => {
    const error = new Error('spanner exploded');
    const fake = make_fake_database({ commit_error: error });

    await expect(
      new SpannerMatchReportStore(fake.database).create_report_if_absent(fresh),
    ).rejects.toBe(error);
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerMatchReportStore (emulator)',
  { timeout: 60_000 },
  () => {
    let database: Database;
    let close: () => Promise<void>;

    beforeAll(() => {
      ({ database, close } = open_emulator_database());
    });

    afterAll(async () => {
      await close();
    });

    describe_match_report_store_contract('Spanner', () => new SpannerMatchReportStore(database));
  },
);
