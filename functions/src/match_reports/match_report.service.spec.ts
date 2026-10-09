import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it, vi } from 'vitest';
import { IncidentType } from '../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../domain/match_reports/team_side.enum.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { InMemoryGameStore } from '../sync/stores/in_memory_game_store.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { MatchReportWriteOutcome } from './enums/match_report_write_outcome.enum.js';
import { IdempotencyKeyConflictError } from './errors/idempotency_key_conflict.error.js';
import { MatchReportNotFoundError } from './errors/match_report_not_found.error.js';
import { MatchReportValidationError } from './errors/match_report_validation.error.js';
import { ReportConflictError } from './errors/report_conflict.error.js';
import { ReportGameCancelledError } from './errors/report_game_cancelled.error.js';
import { ReportGameNotFoundError } from './errors/report_game_not_found.error.js';
import { ReportNotEditableError } from './errors/report_not_editable.error.js';
import { ReportNotReadyError } from './errors/report_not_ready.error.js';
import { TooManyIncidentsError } from './errors/too_many_incidents.error.js';
import { MATCH_REPORT_AUDIT_RESOURCE, MatchReportService } from './match_report.service.js';
import { MATCH_REPORT_LIMITS } from './match_report_limits.constant.js';
import { IAddIncidentInput } from './models/add_incident_input.model.js';
import { ISetScoresInput } from './models/set_scores_input.model.js';
import { InMemoryMatchReportStore } from './stores/in_memory_match_report_store.js';
import {
  make_contract_edit,
  make_contract_incident,
} from './stores/contracts/make_contract_match_report.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-ref',
  actual_role: 'PLATFORM_ADMIN',
  effective_role: 'TENANT_MEMBER',
};
const OTHER_ACTOR: IActingUser = { ...ACTOR, tenant_id: 't2', user_id: 'u-other' };

const SCORES: ISetScoresInput = {
  home_score: 2,
  away_score: 1,
  notes: undefined,
  client_revision: 0,
};

/**
 * Builds an incident request.
 * @param key Idempotency key.
 * @param overrides Fields to replace.
 * @returns The request.
 */
function incident_input(
  key: string,
  overrides: Partial<IAddIncidentInput> = {},
): IAddIncidentInput {
  return {
    idempotency_key: key,
    team_side: TeamSide.HOME,
    incident_type: IncidentType.YELLOW,
    jersey_number: 7,
    minute: 33,
    reason_code: 'DISSENT',
    notes: 'Private words about a player',
    ...overrides,
  };
}

/**
 * Builds the service over in-memory parts, a clock that advances one second per reading, and
 * sequential ids. Game `g1` is the tenant's own, scheduled game.
 * @param options Clock behaviour.
 * @returns The service and the parts a spec inspects.
 */
async function make_service(options: { frozen_clock?: boolean } = {}) {
  const reports = new InMemoryMatchReportStore();
  const games = new InMemoryGameStore();
  await games.save_games([make_contract_game('t1', 'g1', { is_mine: true })]);
  const audit_store = create_in_memory_audit_log_store();
  let counter = 0;
  let clock = 10_000;
  const service = new MatchReportService({
    reports,
    games,
    audit: create_audit_log_service({ store: audit_store, now: () => 5000 }),
    now: () => (options.frozen_clock ? clock : (clock += 1000)),
    generate_id: () => `id-${++counter}`,
  });
  return { service, reports, games, audit_store };
}

/**
 * Makes the first write to a store wait until `rival` has made a competing write, so the service
 * loses its compare-and-swap exactly once.
 * @param reports Store to intercept.
 * @param rival Performs the competing write.
 * @returns Nothing.
 */
function lose_first_race(reports: InMemoryMatchReportStore, rival: () => Promise<void>): void {
  const original = reports.apply_edit.bind(reports);
  vi.spyOn(reports, 'apply_edit').mockImplementationOnce(async (...args) => {
    await rival();
    return original(...args);
  });
}

describe('MatchReportService.create_for_game', () => {
  it("creates an empty DRAFT report for one of the referee's own games", async () => {
    const { service, reports } = await make_service();

    const result = await service.create_for_game(ACTOR, 'g1');

    expect(result.created).toBe(true);
    expect(result.report).toEqual({
      tenant_id: 't1',
      report_id: 'id-1',
      game_id: 'g1',
      status: MatchReportStatus.DRAFT,
      home_score: null,
      away_score: null,
      notes: null,
      incidents: [],
      client_revision: 0,
      lock_version: 0,
      created_at: 11_000,
      created_by: 'u-ref',
      updated_at: 11_000,
      updated_by: 'u-ref',
    });
    expect(await reports.get_report('t1', 'id-1')).toEqual(result.report);
  });

  it('returns the report the game already has instead of making a second one', async () => {
    const { service, reports } = await make_service();
    const first = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, first.report.report_id, SCORES);

    const second = await service.create_for_game(ACTOR, 'g1');

    expect(second.created).toBe(false);
    expect(second.report.report_id).toBe(first.report.report_id);
    expect(second.report.home_score).toBe(2);
    expect(
      await reports.list_reports('t1', { status: null, game_id: null, limit: 10 }),
    ).toHaveLength(1);
  });

  it('lets simultaneous requests share one report', async () => {
    const { service } = await make_service();

    const results = await Promise.all([
      service.create_for_game(ACTOR, 'g1'),
      service.create_for_game(ACTOR, 'g1'),
      service.create_for_game(ACTOR, 'g1'),
    ]);

    expect(new Set(results.map((result) => result.report.report_id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
  });

  it.each([
    ['an unknown game', 'nope', (games: InMemoryGameStore) => games.save_games([])],
    [
      "a game that is open but not the referee's own",
      'g2',
      (games: InMemoryGameStore) =>
        games.save_games([make_contract_game('t1', 'g2', { is_mine: false, is_open: true })]),
    ],
    [
      'a game that was removed',
      'g3',
      (games: InMemoryGameStore) =>
        games.save_games([make_contract_game('t1', 'g3', { is_mine: true, removed_at: 5 })]),
    ],
    [
      "another tenant's game",
      'g4',
      (games: InMemoryGameStore) =>
        games.save_games([make_contract_game('t2', 'g4', { is_mine: true })]),
    ],
  ])('refuses %s as not found and stores nothing', async (_name, game_id, seed) => {
    const { service, games, reports } = await make_service();
    await seed(games);

    await expect(service.create_for_game(ACTOR, game_id)).rejects.toBeInstanceOf(
      ReportGameNotFoundError,
    );

    expect(await reports.list_reports('t1', { status: null, game_id: null, limit: 10 })).toEqual(
      [],
    );
  });

  it('refuses a cancelled game with its own error and stores nothing', async () => {
    const { service, games, reports } = await make_service();
    await games.save_games([
      make_contract_game('t1', 'g5', { is_mine: true, status: GameStatus.CANCELLED }),
    ]);

    await expect(service.create_for_game(ACTOR, 'g5')).rejects.toBeInstanceOf(
      ReportGameCancelledError,
    );

    expect(await reports.get_report_by_game('t1', 'g5')).toBeNull();
  });

  it('does not reveal that a cancelled game belongs to someone else', async () => {
    const { service, games } = await make_service();
    await games.save_games([
      make_contract_game('t2', 'g6', { is_mine: true, status: GameStatus.CANCELLED }),
    ]);

    await expect(service.create_for_game(ACTOR, 'g6')).rejects.toBeInstanceOf(
      ReportGameNotFoundError,
    );
  });
});

describe('MatchReportService.get_report and list_reports', () => {
  it("reads a report of the tenant and refuses everyone else's", async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    expect(await service.get_report('t1', report.report_id)).toEqual(report);
    await expect(service.get_report('t2', report.report_id)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
    await expect(service.get_report('t1', 'nope')).rejects.toBeInstanceOf(MatchReportNotFoundError);
  });

  it('lists with the filters and the 200 report cap', async () => {
    const { service, reports } = await make_service();
    const spy = vi.spyOn(reports, 'list_reports');

    await service.list_reports('t1', { status: MatchReportStatus.READY, game_id: 'g1' });

    expect(spy).toHaveBeenCalledWith('t1', {
      status: MatchReportStatus.READY,
      game_id: 'g1',
      limit: 200,
    });
  });
});

describe('MatchReportService.set_scores', () => {
  it('saves the scores, stamps the editor and moves the revision past the one sent', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    const updated = await service.set_scores({ ...ACTOR, user_id: 'u-editor' }, report.report_id, {
      home_score: 3,
      away_score: 0,
      notes: 'Calm game',
      client_revision: 0,
    });

    expect(updated).toMatchObject({
      home_score: 3,
      away_score: 0,
      notes: 'Calm game',
      client_revision: 1,
      lock_version: 1,
      status: MatchReportStatus.DRAFT,
      updated_by: 'u-editor',
      created_by: 'u-ref',
    });
    expect(await reports.get_report('t1', report.report_id)).toEqual(updated);
  });

  it('keeps the notes when none are sent, replaces them when sent, and clears them with null', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;
    await service.set_scores(ACTOR, id, { ...SCORES, notes: 'first', client_revision: 0 });

    const kept = await service.set_scores(ACTOR, id, {
      ...SCORES,
      notes: undefined,
      client_revision: 1,
    });
    const replaced = await service.set_scores(ACTOR, id, {
      ...SCORES,
      notes: 'second',
      client_revision: 2,
    });
    const cleared = await service.set_scores(ACTOR, id, {
      ...SCORES,
      notes: null,
      client_revision: 3,
    });

    expect(kept.notes).toBe('first');
    expect(replaced.notes).toBe('second');
    expect(cleared.notes).toBeNull();
  });

  it('clears a score with null', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);

    const updated = await service.set_scores(ACTOR, report.report_id, {
      ...SCORES,
      home_score: null,
      client_revision: 1,
    });

    expect(updated).toMatchObject({ home_score: null, away_score: 1 });
  });

  it('applies an edit based on exactly the stored revision', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const first = await service.set_scores(ACTOR, report.report_id, SCORES);

    const second = await service.set_scores(ACTOR, report.report_id, {
      ...SCORES,
      home_score: 5,
      client_revision: first.client_revision,
    });

    expect(second.home_score).toBe(5);
  });

  it('ignores an edit based on an older revision and returns the stored report untouched', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;
    await service.set_scores(ACTOR, id, { ...SCORES, home_score: 1, client_revision: 0 });
    const newest = await service.set_scores(ACTOR, id, {
      ...SCORES,
      home_score: 4,
      client_revision: 1,
    });
    const apply_spy = vi.spyOn(reports, 'apply_edit');

    const delayed = await service.set_scores(ACTOR, id, {
      ...SCORES,
      home_score: 1,
      client_revision: 0,
    });

    expect(delayed).toEqual(newest);
    expect(delayed.home_score).toBe(4);
    expect(apply_spy).not.toHaveBeenCalled();
    expect((await reports.get_report('t1', id))?.lock_version).toBe(newest.lock_version);
  });

  it('treats a retry of an applied request as stale, so it can never apply twice', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const request: ISetScoresInput = { ...SCORES, home_score: 6, client_revision: 0 };
    const applied = await service.set_scores(ACTOR, report.report_id, request);
    await service.set_scores(ACTOR, report.report_id, {
      ...SCORES,
      home_score: 9,
      client_revision: 1,
    });

    const retried = await service.set_scores(ACTOR, report.report_id, request);

    expect(applied.home_score).toBe(6);
    expect(retried.home_score).toBe(9);
  });

  it('moves the stored revision past a client counter that ran ahead, so older edits stay ignored', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;

    const ahead = await service.set_scores(ACTOR, id, {
      ...SCORES,
      home_score: 7,
      client_revision: 10,
    });
    const late = await service.set_scores(ACTOR, id, {
      ...SCORES,
      home_score: 8,
      client_revision: 5,
    });

    expect(ahead.client_revision).toBe(11);
    expect(late.home_score).toBe(7);
  });

  it('refuses a report that is no longer a draft', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    await service.mark_ready(ACTOR, report.report_id);

    await expect(
      service.set_scores(ACTOR, report.report_id, { ...SCORES, home_score: 9, client_revision: 5 }),
    ).rejects.toBeInstanceOf(ReportNotEditableError);
  });

  it('answers a stale retry on a ready report with the report instead of an error', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    await service.mark_ready(ACTOR, report.report_id);

    const answered = await service.set_scores(ACTOR, report.report_id, SCORES);

    expect(answered.status).toBe(MatchReportStatus.READY);
    expect(answered.home_score).toBe(2);
  });

  it("refuses an unknown report and another tenant's report without touching it", async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    await expect(service.set_scores(ACTOR, 'nope', SCORES)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
    await expect(service.set_scores(OTHER_ACTOR, report.report_id, SCORES)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );

    expect(await reports.get_report('t1', report.report_id)).toEqual(report);
  });

  it('turns a score the domain refuses into a validation error naming the field', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    const error = await service
      .set_scores(ACTOR, report.report_id, { ...SCORES, home_score: 100 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MatchReportValidationError);
    expect((error as MatchReportValidationError).violations[0]?.path).toBe('home_score');
    expect(await reports.get_report('t1', report.report_id)).toEqual(report);
  });

  it('writes no audit row for an ordinary edit', async () => {
    const { service, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    await service.set_scores(ACTOR, report.report_id, SCORES);

    expect(audit_store.rows).toHaveLength(0);
  });

  it('retries after losing a race and keeps what the other writer saved', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        id,
        0,
        make_contract_edit(report, { add_incident: make_contract_incident('rival') }),
        20_000,
        'rival',
      );
    });

    const updated = await service.set_scores(ACTOR, id, { ...SCORES, home_score: 5 });

    expect(updated.home_score).toBe(5);
    expect(updated.incidents.map((incident) => incident.incident_id)).toEqual(['rival']);
    expect(updated.lock_version).toBe(2);
  });

  it('ignores the edit when the race was lost to a newer revision', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        id,
        0,
        make_contract_edit(report, { home_score: 8, away_score: 8, client_revision: 5 }),
        20_000,
        'rival',
      );
    });

    const answered = await service.set_scores(ACTOR, id, {
      ...SCORES,
      home_score: 1,
      client_revision: 2,
    });

    expect(answered).toMatchObject({ home_score: 8, away_score: 8, client_revision: 5 });
    expect(answered.lock_version).toBe(1);
  });

  it('gives up with a conflict after the bounded number of lost races', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const spy = vi
      .spyOn(reports, 'apply_edit')
      .mockResolvedValue({ outcome: MatchReportWriteOutcome.LOST_RACE, report: null });

    await expect(service.set_scores(ACTOR, report.report_id, SCORES)).rejects.toBeInstanceOf(
      ReportConflictError,
    );

    expect(spy).toHaveBeenCalledTimes(MATCH_REPORT_LIMITS.MAX_WRITE_ATTEMPTS);
  });

  it('reports a report deleted mid-write as not found', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    vi.spyOn(reports, 'apply_edit').mockResolvedValue({
      outcome: MatchReportWriteOutcome.NOT_FOUND,
      report: null,
    });

    await expect(service.set_scores(ACTOR, report.report_id, SCORES)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
  });
});

describe('MatchReportService.add_incident', () => {
  it('adds the incident with the actor stamped, and leaves the score revision alone', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);

    const result = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );

    expect(result.was_duplicate).toBe(false);
    expect(result.report.client_revision).toBe(1);
    expect(result.report.lock_version).toBe(2);
    expect(result.report.incidents).toEqual([
      {
        incident_id: 'id-2',
        idempotency_key: 'key-aaaa1111',
        team_side: TeamSide.HOME,
        jersey_number: 7,
        incident_type: IncidentType.YELLOW,
        minute: 33,
        reason_code: 'DISSENT',
        notes: 'Private words about a player',
        created_at: expect.any(Number),
        created_by: 'u-ref',
        updated_at: expect.any(Number),
        updated_by: 'u-ref',
      },
    ]);
  });

  it('answers a repeated key with the current report and adds nothing', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const first = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );
    const apply_spy = vi.spyOn(reports, 'apply_edit');

    const replay = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111', { minute: 90 }),
    );

    expect(replay.was_duplicate).toBe(true);
    expect(replay.report).toEqual(first.report);
    expect(replay.report.incidents).toHaveLength(1);
    expect(apply_spy).not.toHaveBeenCalled();
  });

  it('still answers a replay after the report was marked ready', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    await service.add_incident(ACTOR, report.report_id, incident_input('key-aaaa1111'));
    await service.mark_ready(ACTOR, report.report_id);

    const replay = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );

    expect(replay.was_duplicate).toBe(true);
    expect(replay.report.status).toBe(MatchReportStatus.READY);
  });

  it('refuses a key that already belongs to an incident on another report of the tenant', async () => {
    const { service, games } = await make_service();
    await games.save_games([make_contract_game('t1', 'g2', { is_mine: true })]);
    const first = await service.create_for_game(ACTOR, 'g1');
    const second = await service.create_for_game(ACTOR, 'g2');
    await service.add_incident(ACTOR, first.report.report_id, incident_input('key-shared-1'));

    await expect(
      service.add_incident(ACTOR, second.report.report_id, incident_input('key-shared-1')),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);

    expect((await service.get_report('t1', second.report.report_id)).incidents).toEqual([]);
    expect((await service.get_report('t1', first.report.report_id)).incidents).toHaveLength(1);
  });

  it('lets another tenant use the same key', async () => {
    const { service, games } = await make_service();
    await games.save_games([make_contract_game('t2', 'g9', { is_mine: true })]);
    const mine = await service.create_for_game(ACTOR, 'g1');
    const theirs = await service.create_for_game(OTHER_ACTOR, 'g9');
    await service.add_incident(ACTOR, mine.report.report_id, incident_input('key-shared-1'));

    const result = await service.add_incident(
      OTHER_ACTOR,
      theirs.report.report_id,
      incident_input('key-shared-1'),
    );

    expect(result.was_duplicate).toBe(false);
  });

  it('refuses to add to a report that is no longer a draft', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    await service.mark_ready(ACTOR, report.report_id);

    await expect(
      service.add_incident(ACTOR, report.report_id, incident_input('key-new-0001')),
    ).rejects.toBeInstanceOf(ReportNotEditableError);
  });

  it("refuses an unknown report and another tenant's report", async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    await expect(
      service.add_incident(ACTOR, 'nope', incident_input('key-aaaa1111')),
    ).rejects.toBeInstanceOf(MatchReportNotFoundError);
    await expect(
      service.add_incident(OTHER_ACTOR, report.report_id, incident_input('key-aaaa1111')),
    ).rejects.toBeInstanceOf(MatchReportNotFoundError);
  });

  it('refuses a 61st incident but still answers a replay of one already there', async () => {
    const { service } = await make_service({ frozen_clock: true });
    const { report } = await service.create_for_game(ACTOR, 'g1');
    for (let index = 0; index < MATCH_REPORT_LIMITS.MAX_INCIDENTS_PER_REPORT; index++) {
      await service.add_incident(
        ACTOR,
        report.report_id,
        incident_input(`key-${String(index).padStart(8, '0')}`),
      );
    }

    await expect(
      service.add_incident(ACTOR, report.report_id, incident_input('key-one-more')),
    ).rejects.toBeInstanceOf(TooManyIncidentsError);
    const replay = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-00000000'),
    );

    expect(replay.was_duplicate).toBe(true);
    expect(replay.report.incidents).toHaveLength(60);
  });

  it('accepts the 60th incident', async () => {
    const { service } = await make_service({ frozen_clock: true });
    const { report } = await service.create_for_game(ACTOR, 'g1');
    for (let index = 0; index < 59; index++) {
      await service.add_incident(
        ACTOR,
        report.report_id,
        incident_input(`key-${String(index).padStart(8, '0')}`),
      );
    }

    const result = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-the-last'),
    );

    expect(result.report.incidents).toHaveLength(60);
  });

  it('keeps incidents in the order they were added even when the clock does not move', async () => {
    const { service } = await make_service({ frozen_clock: true });
    const { report } = await service.create_for_game(ACTOR, 'g1');
    let latest = report;
    for (const key of ['key-aaaa0001', 'key-aaaa0002', 'key-aaaa0003']) {
      latest = (await service.add_incident(ACTOR, report.report_id, incident_input(key))).report;
    }

    expect(latest.incidents.map((incident) => incident.idempotency_key)).toEqual([
      'key-aaaa0001',
      'key-aaaa0002',
      'key-aaaa0003',
    ]);
    const stamps = latest.incidents.map((incident) => incident.created_at);
    expect(new Set(stamps).size).toBe(3);
  });

  it('turns an incident the domain refuses into a validation error naming the field', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    const error = await service
      .add_incident(
        ACTOR,
        report.report_id,
        incident_input('key-aaaa1111', { jersey_number: 1000 }),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MatchReportValidationError);
    expect((error as MatchReportValidationError).violations.map((v) => v.path)).toEqual([
      'jersey_number',
    ]);
    expect((await reports.get_report('t1', report.report_id))?.incidents).toEqual([]);
  });

  it('answers a racing request with the same key as a replay: exactly one incident', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        report.report_id,
        0,
        make_contract_edit(report, {
          add_incident: make_contract_incident('rival', { idempotency_key: 'key-aaaa1111' }),
        }),
        20_000,
        'rival',
      );
    });

    const result = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );

    expect(result.was_duplicate).toBe(true);
    expect(result.report.incidents.map((incident) => incident.incident_id)).toEqual(['rival']);
  });

  it('retries when the store reports a key clash that turns out to be this very report', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    vi.spyOn(reports, 'apply_edit').mockImplementationOnce(async () => {
      await reports.apply_edit(
        't1',
        report.report_id,
        0,
        make_contract_edit(report, {
          add_incident: make_contract_incident('rival', { idempotency_key: 'key-aaaa1111' }),
        }),
        20_000,
        'rival',
      );
      return { outcome: MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT, report: null };
    });

    const result = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );

    expect(result.was_duplicate).toBe(true);
    expect(result.report.incidents).toHaveLength(1);
  });

  it("adds on top of a rival's change after losing a race", async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        report.report_id,
        0,
        make_contract_edit(report, { home_score: 3 }),
        20_000,
        'rival',
      );
    });

    const result = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa1111'),
    );

    expect(result.report).toMatchObject({ home_score: 3, lock_version: 2 });
    expect(result.report.incidents).toHaveLength(1);
  });
});

describe('MatchReportService.remove_incident', () => {
  it('removes only the named incident and leaves the score revision alone', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const id = report.report_id;
    const first = await service.add_incident(ACTOR, id, incident_input('key-aaaa0001'));
    const second = await service.add_incident(ACTOR, id, incident_input('key-aaaa0002'));
    const doomed = first.report.incidents[0]!.incident_id;

    const updated = await service.remove_incident(ACTOR, id, doomed);

    expect(updated.incidents.map((incident) => incident.idempotency_key)).toEqual(['key-aaaa0002']);
    expect(updated.client_revision).toBe(second.report.client_revision);
    expect(updated.lock_version).toBe(second.report.lock_version + 1);
  });

  it('treats removing an unknown incident, or the same one twice, as a no-op without a write', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const added = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa0001'),
    );
    const incident_id = added.report.incidents[0]!.incident_id;
    const first = await service.remove_incident(ACTOR, report.report_id, incident_id);
    const apply_spy = vi.spyOn(reports, 'apply_edit');

    const again = await service.remove_incident(ACTOR, report.report_id, incident_id);
    const unknown = await service.remove_incident(ACTOR, report.report_id, 'ghost');

    expect(again).toEqual(first);
    expect(unknown).toEqual(first);
    expect(apply_spy).not.toHaveBeenCalled();
  });

  it('refuses to undo on a report that is no longer a draft', async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    const added = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa0001'),
    );
    await service.mark_ready(ACTOR, report.report_id);

    await expect(
      service.remove_incident(ACTOR, report.report_id, added.report.incidents[0]!.incident_id),
    ).rejects.toBeInstanceOf(ReportNotEditableError);
    const noop = await service.remove_incident(ACTOR, report.report_id, 'ghost');
    expect(noop.status).toBe(MatchReportStatus.READY);
  });

  it("refuses an unknown report and another tenant's report", async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const added = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa0001'),
    );
    const incident_id = added.report.incidents[0]!.incident_id;

    await expect(service.remove_incident(ACTOR, 'nope', incident_id)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
    await expect(
      service.remove_incident(OTHER_ACTOR, report.report_id, incident_id),
    ).rejects.toBeInstanceOf(MatchReportNotFoundError);
    expect((await service.get_report('t1', report.report_id)).incidents).toHaveLength(1);
  });

  it('retries after losing a race', async () => {
    const { service, reports } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const added = await service.add_incident(
      ACTOR,
      report.report_id,
      incident_input('key-aaaa0001'),
    );
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        report.report_id,
        added.report.lock_version,
        make_contract_edit(added.report, { notes: 'rival note' }),
        20_000,
        'rival',
      );
    });

    const updated = await service.remove_incident(
      ACTOR,
      report.report_id,
      added.report.incidents[0]!.incident_id,
    );

    expect(updated.incidents).toEqual([]);
    expect(updated.notes).toBe('rival note');
  });
});

describe('MatchReportService.mark_ready and reopen', () => {
  it('refuses a report with no scores, names every blocker, and changes nothing', async () => {
    const { service, reports, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    const error = await service
      .mark_ready(ACTOR, report.report_id)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ReportNotReadyError);
    expect((error as ReportNotReadyError).violations.map((violation) => violation.path)).toEqual([
      'home_score',
      'away_score',
    ]);
    expect(await reports.get_report('t1', report.report_id)).toEqual(report);
    expect(audit_store.rows).toHaveLength(0);
  });

  it('marks a complete report READY and writes one audit row without any notes', async () => {
    const { service, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, {
      ...SCORES,
      notes: 'SECRET report notes',
    });
    await service.add_incident(ACTOR, report.report_id, incident_input('key-aaaa0001'));

    const ready = await service.mark_ready(ACTOR, report.report_id);

    expect(ready.status).toBe(MatchReportStatus.READY);
    expect(audit_store.rows).toHaveLength(1);
    const row = audit_store.rows[0]!;
    expect(row).toMatchObject({
      user_id: 'u-ref',
      tenant_id: 't1',
      resource_type: MATCH_REPORT_AUDIT_RESOURCE,
      resource_id: report.report_id,
      action: 'UPDATE',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_MEMBER',
    });
    expect(JSON.parse(String(row.before_state_json))).toEqual({
      report_id: report.report_id,
      game_id: 'g1',
      status: 'DRAFT',
      home_score: 2,
      away_score: 1,
      incident_count: 1,
    });
    expect(JSON.parse(String(row.after_state_json))).toEqual({
      report_id: report.report_id,
      game_id: 'g1',
      status: 'READY',
      home_score: 2,
      away_score: 1,
      incident_count: 1,
    });
    const serialized = JSON.stringify(audit_store.rows);
    expect(serialized).not.toContain('SECRET report notes');
    expect(serialized).not.toContain('Private words about a player');
  });

  it('answers a second mark-ready with the READY report and no second audit row', async () => {
    const { service, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    const first = await service.mark_ready(ACTOR, report.report_id);

    const second = await service.mark_ready(ACTOR, report.report_id);

    expect(second).toEqual(first);
    expect(audit_store.rows).toHaveLength(1);
  });

  it.each([MatchReportStatus.SUBMITTED, MatchReportStatus.NOT_SUPPORTED])(
    'refuses to mark a %s report ready or to reopen it',
    async (status) => {
      const { service, reports } = await make_service();
      const { report } = await service.create_for_game(ACTOR, 'g1');
      await reports.apply_edit(
        't1',
        report.report_id,
        0,
        make_contract_edit(report, { status, home_score: 1, away_score: 1 }),
        20_000,
        'system',
      );

      await expect(service.mark_ready(ACTOR, report.report_id)).rejects.toBeInstanceOf(
        ReportNotEditableError,
      );
      await expect(service.reopen(ACTOR, report.report_id)).rejects.toBeInstanceOf(
        ReportNotEditableError,
      );
      expect((await reports.get_report('t1', report.report_id))?.status).toBe(status);
    },
  );

  it('reopens a READY report to DRAFT with an audit row, and then it can be edited again', async () => {
    const { service, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    await service.set_scores(ACTOR, report.report_id, SCORES);
    await service.mark_ready(ACTOR, report.report_id);

    const reopened = await service.reopen(ACTOR, report.report_id);
    const edited = await service.set_scores(ACTOR, report.report_id, {
      ...SCORES,
      home_score: 4,
      client_revision: reopened.client_revision,
    });

    expect(reopened.status).toBe(MatchReportStatus.DRAFT);
    expect(edited.home_score).toBe(4);
    expect(audit_store.rows).toHaveLength(2);
    expect(JSON.parse(String(audit_store.rows[1]!.before_state_json))).toMatchObject({
      status: 'READY',
    });
    expect(JSON.parse(String(audit_store.rows[1]!.after_state_json))).toMatchObject({
      status: 'DRAFT',
    });
  });

  it('answers reopening a draft with the draft and no audit row', async () => {
    const { service, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    const answered = await service.reopen(ACTOR, report.report_id);

    expect(answered).toEqual(report);
    expect(audit_store.rows).toHaveLength(0);
  });

  it("refuses an unknown report and another tenant's report", async () => {
    const { service } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');

    await expect(service.mark_ready(ACTOR, 'nope')).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
    await expect(service.reopen(OTHER_ACTOR, report.report_id)).rejects.toBeInstanceOf(
      MatchReportNotFoundError,
    );
  });

  it('re-checks readiness against the report as it is after losing a race', async () => {
    const { service, reports, audit_store } = await make_service();
    const { report } = await service.create_for_game(ACTOR, 'g1');
    const filled = await service.set_scores(ACTOR, report.report_id, SCORES);
    lose_first_race(reports, async () => {
      await reports.apply_edit(
        't1',
        report.report_id,
        filled.lock_version,
        make_contract_edit(filled, { home_score: null }),
        20_000,
        'rival',
      );
    });

    await expect(service.mark_ready(ACTOR, report.report_id)).rejects.toBeInstanceOf(
      ReportNotReadyError,
    );

    expect((await reports.get_report('t1', report.report_id))?.status).toBe(
      MatchReportStatus.DRAFT,
    );
    expect(audit_store.rows).toHaveLength(0);
  });
});
