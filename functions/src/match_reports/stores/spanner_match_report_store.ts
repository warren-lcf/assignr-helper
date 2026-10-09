import { Database } from '@google-cloud/spanner';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import {
  to_nullable_number,
  to_nullable_string,
  to_number,
} from '../../sync/stores/spanner_row_values.js';
import { MatchReportWriteOutcome } from '../enums/match_report_write_outcome.enum.js';
import { ICreateMatchReportResult } from '../models/create_match_report_result.model.js';
import { IListMatchReportsQuery } from '../models/list_match_reports_query.model.js';
import { IMatchReportEdit } from '../models/match_report_edit.model.js';
import { IMatchReportWriteResult } from '../models/match_report_write_result.model.js';
import { IStoredMatchIncident } from '../models/stored_match_incident.model.js';
import { IStoredMatchReport } from '../models/stored_match_report.model.js';
import { IMatchReportStore } from '../ports/match_report_store.interface.js';
import { compare_incidents } from './compare_incidents.js';
import { require_team_side } from './require_team_side.js';

const REPORT_COLUMNS =
  'tenant_id, report_id, game_id, status, home_score, away_score, notes, client_revision, ' +
  'lock_version, created_at, created_by, updated_at, updated_by';

const INCIDENT_COLUMNS =
  'tenant_id, report_id, incident_id, team_side, jersey_number, incident_type, minute, ' +
  'reason_code, idempotency_key, notes, created_at, created_by, updated_at, updated_by';

const REPORT_KEY_SQL = 'WHERE tenant_id = @tenant_id AND report_id = @report_id';

/** gRPC status ALREADY_EXISTS, which Spanner raises for a duplicate key or unique index entry. */
const GRPC_ALREADY_EXISTS = 6;

const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.values(MatchReportStatus));
const KNOWN_INCIDENT_TYPES: ReadonlySet<string> = new Set(Object.values(IncidentType));
const KNOWN_TEAM_SIDES: ReadonlySet<string> = new Set(Object.values(TeamSide));

/** The part of a Spanner snapshot or read-write transaction these reads use. */
interface IQueryRunner {
  run(request: {
    sql: string;
    params: Record<string, unknown>;
    types: Record<string, unknown>;
    json: true;
  }): Promise<unknown[]>;
}

/**
 * Spanner `IMatchReportStore` over `match_reports` and its interleaved `match_report_incidents`.
 * It uses the Spanner client directly instead of core-server's CRUD helpers to match the other
 * stores: the service stamps the rows and writes the audit rows itself. Reads run against one
 * snapshot so a report and its incidents agree. Every edit is one read-write transaction that
 * re-reads the report, compares `lock_version`, checks the tenant-wide idempotency key and only
 * then buffers its writes, so the check and the write cannot be separated by another writer.
 */
export class SpannerMatchReportStore implements IMatchReportStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the match report tables.
   */
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async get_report(
    tenant_id: string,
    report_id: string,
  ): Promise<IStoredMatchReport | null> {
    const [report] = await this.read_snapshot((runner) =>
      this.read_reports(
        runner,
        `SELECT ${REPORT_COLUMNS} FROM match_reports ${REPORT_KEY_SQL}`,
        { tenant_id, report_id },
        { tenant_id: 'string', report_id: 'string' },
      ),
    );
    return report ?? null;
  }

  /** @inheritdoc */
  public async get_report_by_game(
    tenant_id: string,
    game_id: string,
  ): Promise<IStoredMatchReport | null> {
    const [report] = await this.read_snapshot((runner) =>
      this.read_by_game(runner, tenant_id, game_id),
    );
    return report ?? null;
  }

  /** @inheritdoc */
  public async list_reports(
    tenant_id: string,
    query: IListMatchReportsQuery,
  ): Promise<IStoredMatchReport[]> {
    const row_limit = Math.floor(query.limit);
    if (!(row_limit >= 1)) {
      return [];
    }
    const params: Record<string, unknown> = { tenant_id, row_limit };
    const types: Record<string, unknown> = { tenant_id: 'string', row_limit: 'int64' };
    let filters = '';
    if (query.status !== null) {
      filters += ' AND status = @status';
      params['status'] = query.status;
      types['status'] = 'string';
    }
    if (query.game_id !== null) {
      filters += ' AND game_id = @game_id';
      params['game_id'] = query.game_id;
      types['game_id'] = 'string';
    }
    return this.read_snapshot((runner) =>
      this.read_reports(
        runner,
        `SELECT ${REPORT_COLUMNS} FROM match_reports WHERE tenant_id = @tenant_id${filters} ` +
          'ORDER BY created_at DESC, report_id DESC LIMIT @row_limit',
        params,
        types,
      ),
    );
  }

  /** @inheritdoc */
  public async create_report_if_absent(
    report: IStoredMatchReport,
  ): Promise<ICreateMatchReportResult> {
    try {
      return await run_write_transaction(this.database, async (transaction) => {
        const [existing] = await this.read_by_game(transaction, report.tenant_id, report.game_id);
        if (existing) {
          return { report: existing, created: false };
        }
        transaction.insert('match_reports', {
          tenant_id: report.tenant_id,
          report_id: report.report_id,
          game_id: report.game_id,
          status: report.status,
          home_score: report.home_score,
          away_score: report.away_score,
          notes: report.notes,
          client_revision: report.client_revision,
          lock_version: report.lock_version,
          created_at: report.created_at,
          created_by: report.created_by,
          updated_at: report.updated_at,
          updated_by: report.updated_by,
        });
        return { report: { ...structuredClone(report), incidents: [] }, created: true };
      });
    } catch (error) {
      // Two simultaneous creators both found nothing; the unique index rejected the later commit.
      if ((error as { code?: unknown } | null)?.code === GRPC_ALREADY_EXISTS) {
        const winner = await this.get_report_by_game(report.tenant_id, report.game_id);
        if (winner) {
          return { report: winner, created: false };
        }
      }
      throw error;
    }
  }

  /** @inheritdoc */
  public async apply_edit(
    tenant_id: string,
    report_id: string,
    expected_lock_version: number,
    edit: IMatchReportEdit,
    now: number,
    actor: string,
  ): Promise<IMatchReportWriteResult> {
    if (edit.add_incident) {
      require_team_side(edit.add_incident.team_side);
    }
    return run_write_transaction(this.database, async (transaction) => {
      const [existing] = await this.read_reports(
        transaction,
        `SELECT ${REPORT_COLUMNS} FROM match_reports ${REPORT_KEY_SQL}`,
        { tenant_id, report_id },
        { tenant_id: 'string', report_id: 'string' },
      );
      if (!existing) {
        return { outcome: MatchReportWriteOutcome.NOT_FOUND, report: null };
      }
      if (existing.lock_version !== expected_lock_version) {
        return { outcome: MatchReportWriteOutcome.LOST_RACE, report: null };
      }
      const added = edit.add_incident;
      if (added && (await this.key_is_taken(transaction, tenant_id, added.idempotency_key))) {
        return { outcome: MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT, report: null };
      }

      const removed = existing.incidents.some(
        (incident) => incident.incident_id === edit.remove_incident_id,
      );
      if (removed && edit.remove_incident_id !== null) {
        transaction.deleteRows('match_report_incidents', [
          [tenant_id, report_id, edit.remove_incident_id],
        ]);
      }
      if (added) {
        transaction.insert('match_report_incidents', {
          tenant_id,
          report_id,
          incident_id: added.incident_id,
          team_side: added.team_side,
          jersey_number: added.jersey_number,
          incident_type: added.incident_type,
          minute: added.minute,
          reason_code: added.reason_code,
          idempotency_key: added.idempotency_key,
          notes: added.notes,
          created_at: added.created_at,
          created_by: added.created_by,
          updated_at: added.updated_at,
          updated_by: added.updated_by,
        });
      }
      const updated: IStoredMatchReport = {
        ...existing,
        status: edit.status,
        home_score: edit.home_score,
        away_score: edit.away_score,
        notes: edit.notes,
        client_revision: edit.client_revision,
        lock_version: existing.lock_version + 1,
        updated_at: now,
        updated_by: actor,
        incidents: existing.incidents.filter(
          (incident) => incident.incident_id !== edit.remove_incident_id,
        ),
      };
      if (added) {
        updated.incidents.push(structuredClone(added));
        updated.incidents.sort(compare_incidents);
      }
      transaction.update('match_reports', {
        tenant_id,
        report_id,
        status: updated.status,
        home_score: updated.home_score,
        away_score: updated.away_score,
        notes: updated.notes,
        client_revision: updated.client_revision,
        lock_version: updated.lock_version,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      });
      return { outcome: MatchReportWriteOutcome.APPLIED, report: updated };
    });
  }

  /**
   * Runs reads against one snapshot and releases it.
   * @param work Reads through the snapshot.
   * @returns Whatever `work` returned.
   */
  private async read_snapshot<T>(work: (runner: IQueryRunner) => Promise<T>): Promise<T> {
    const [snapshot] = await this.database.getSnapshot();
    try {
      return await work(snapshot as unknown as IQueryRunner);
    } finally {
      snapshot.end();
    }
  }

  /**
   * Reads the report of one game through the unique `match_reports_by_game` index.
   * @param runner Snapshot or transaction to read through.
   * @param tenant_id Owning tenant.
   * @param game_id Game id.
   * @returns The report in a list, or an empty list.
   */
  private read_by_game(
    runner: IQueryRunner,
    tenant_id: string,
    game_id: string,
  ): Promise<IStoredMatchReport[]> {
    return this.read_reports(
      runner,
      `SELECT ${REPORT_COLUMNS} FROM match_reports@{FORCE_INDEX=match_reports_by_game} ` +
        'WHERE tenant_id = @tenant_id AND game_id = @game_id',
      { tenant_id, game_id },
      { tenant_id: 'string', game_id: 'string' },
    );
  }

  /**
   * Runs a reports query and attaches the incidents of the reports it returned.
   * @param runner Snapshot or transaction to read through.
   * @param sql Query selecting `REPORT_COLUMNS` for one tenant.
   * @param params Query parameters; must include `tenant_id`.
   * @param types Parameter types.
   * @returns The reports in query order, each with its incidents oldest first.
   */
  private async read_reports(
    runner: IQueryRunner,
    sql: string,
    params: Record<string, unknown>,
    types: Record<string, unknown>,
  ): Promise<IStoredMatchReport[]> {
    const [report_rows] = (await runner.run({ sql, params, types, json: true })) as [
      Record<string, unknown>[],
    ];
    if (report_rows.length === 0) {
      return [];
    }
    const tenant_id = String(params['tenant_id']);
    const report_ids = report_rows.map((row) => String(row['report_id']));
    const [incident_rows] = (await runner.run({
      sql:
        `SELECT ${INCIDENT_COLUMNS} FROM match_report_incidents ` +
        'WHERE tenant_id = @tenant_id AND report_id IN UNNEST(@report_ids)',
      params: { tenant_id, report_ids },
      types: { tenant_id: 'string', report_ids: { type: 'array', child: 'string' } },
      json: true,
    })) as [Record<string, unknown>[]];

    const incidents_by_report = new Map<string, IStoredMatchIncident[]>();
    for (const row of incident_rows) {
      const incident = this.to_incident(row);
      const report_id = String(row['report_id']);
      const incidents = incidents_by_report.get(report_id) ?? [];
      incidents.push(incident);
      incidents_by_report.set(report_id, incidents);
    }
    return report_rows.map((row) => {
      const incidents = incidents_by_report.get(String(row['report_id'])) ?? [];
      incidents.sort(compare_incidents);
      return this.to_report(row, incidents);
    });
  }

  /**
   * Tells whether any incident of the tenant already uses an idempotency key, through the unique
   * `match_report_incidents_by_idempotency` index.
   * @param runner Open transaction.
   * @param tenant_id Owning tenant.
   * @param idempotency_key Key to look for.
   * @returns True when one does, on any of the tenant's reports.
   */
  private async key_is_taken(
    runner: IQueryRunner,
    tenant_id: string,
    idempotency_key: string,
  ): Promise<boolean> {
    const [rows] = (await runner.run({
      sql:
        'SELECT report_id FROM match_report_incidents@{FORCE_INDEX=match_report_incidents_by_idempotency} ' +
        'WHERE tenant_id = @tenant_id AND idempotency_key = @idempotency_key',
      params: { tenant_id, idempotency_key },
      types: { tenant_id: 'string', idempotency_key: 'string' },
      json: true,
    })) as [Record<string, unknown>[]];
    return rows.length > 0;
  }

  /**
   * Maps a report row to the stored model.
   * @param row Row selected with `REPORT_COLUMNS` in JSON mode.
   * @param incidents The report's incidents.
   * @returns The report.
   * @throws Error naming `status` when it holds an unknown value.
   */
  private to_report(
    row: Record<string, unknown>,
    incidents: IStoredMatchIncident[],
  ): IStoredMatchReport {
    const status = String(row['status']);
    if (!KNOWN_STATUSES.has(status)) {
      throw new Error('Column status holds an unknown value');
    }
    return {
      tenant_id: String(row['tenant_id']),
      report_id: String(row['report_id']),
      game_id: String(row['game_id']),
      status: status as MatchReportStatus,
      home_score: to_nullable_number(row['home_score'], 'home_score'),
      away_score: to_nullable_number(row['away_score'], 'away_score'),
      notes: to_nullable_string(row['notes']),
      incidents,
      client_revision: to_number(row['client_revision'], 'client_revision'),
      lock_version: to_number(row['lock_version'], 'lock_version'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }

  /**
   * Maps an incident row to the stored model.
   * @param row Row selected with `INCIDENT_COLUMNS` in JSON mode.
   * @returns The incident.
   * @throws Error naming the column when `team_side` or `incident_type` hold an unknown value.
   */
  private to_incident(row: Record<string, unknown>): IStoredMatchIncident {
    const team_side = String(row['team_side']);
    if (!KNOWN_TEAM_SIDES.has(team_side)) {
      throw new Error('Column team_side holds an unknown value');
    }
    const incident_type = String(row['incident_type']);
    if (!KNOWN_INCIDENT_TYPES.has(incident_type)) {
      throw new Error('Column incident_type holds an unknown value');
    }
    return {
      incident_id: String(row['incident_id']),
      idempotency_key: String(row['idempotency_key']),
      team_side: team_side as TeamSide,
      jersey_number: to_nullable_number(row['jersey_number'], 'jersey_number'),
      incident_type: incident_type as IncidentType,
      minute: to_nullable_number(row['minute'], 'minute'),
      reason_code: to_nullable_string(row['reason_code']),
      notes: to_nullable_string(row['notes']),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
