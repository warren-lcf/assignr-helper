import { MatchReportWriteOutcome } from '../enums/match_report_write_outcome.enum.js';
import { ICreateMatchReportResult } from '../models/create_match_report_result.model.js';
import { IListMatchReportsQuery } from '../models/list_match_reports_query.model.js';
import { IMatchReportEdit } from '../models/match_report_edit.model.js';
import { IMatchReportWriteResult } from '../models/match_report_write_result.model.js';
import { IStoredMatchReport } from '../models/stored_match_report.model.js';
import { IMatchReportStore } from '../ports/match_report_store.interface.js';
import { compare_incidents } from './compare_incidents.js';
import { require_team_side } from './require_team_side.js';

/**
 * In-memory `IMatchReportStore` for tests and local development. Reads and writes are copies.
 * Like the Spanner tables it enforces one report per (tenant, game) and one incident per
 * (tenant, idempotency key) across all of a tenant's reports.
 */
export class InMemoryMatchReportStore implements IMatchReportStore {
  private readonly rows = new Map<string, IStoredMatchReport>();

  /** @inheritdoc */
  public async get_report(
    tenant_id: string,
    report_id: string,
  ): Promise<IStoredMatchReport | null> {
    const row = this.rows.get(this.key_of(tenant_id, report_id));
    return row ? structuredClone(row) : null;
  }

  /** @inheritdoc */
  public async get_report_by_game(
    tenant_id: string,
    game_id: string,
  ): Promise<IStoredMatchReport | null> {
    const row = this.find_by_game(tenant_id, game_id);
    return row ? structuredClone(row) : null;
  }

  /** @inheritdoc */
  public async list_reports(
    tenant_id: string,
    query: IListMatchReportsQuery,
  ): Promise<IStoredMatchReport[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.tenant_id === tenant_id &&
          (query.status === null || row.status === query.status) &&
          (query.game_id === null || row.game_id === query.game_id),
      )
      .sort((a, b) => {
        if (a.created_at !== b.created_at) {
          return b.created_at - a.created_at;
        }
        if (a.report_id === b.report_id) {
          return 0;
        }
        return a.report_id < b.report_id ? 1 : -1;
      })
      .slice(0, Math.max(0, Math.floor(query.limit)))
      .map((row) => structuredClone(row));
  }

  /** @inheritdoc */
  public async create_report_if_absent(
    report: IStoredMatchReport,
  ): Promise<ICreateMatchReportResult> {
    const existing = this.find_by_game(report.tenant_id, report.game_id);
    if (existing) {
      return { report: structuredClone(existing), created: false };
    }
    const key = this.key_of(report.tenant_id, report.report_id);
    if (this.rows.has(key)) {
      throw new Error('A match report with this id already exists');
    }
    const stored: IStoredMatchReport = { ...structuredClone(report), incidents: [] };
    this.rows.set(key, stored);
    return { report: structuredClone(stored), created: true };
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
    const key = this.key_of(tenant_id, report_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return { outcome: MatchReportWriteOutcome.NOT_FOUND, report: null };
    }
    if (existing.lock_version !== expected_lock_version) {
      return { outcome: MatchReportWriteOutcome.LOST_RACE, report: null };
    }
    const incident = edit.add_incident;
    if (incident && this.key_is_taken(tenant_id, incident.idempotency_key)) {
      return { outcome: MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT, report: null };
    }

    const incidents = existing.incidents.filter(
      (candidate) => candidate.incident_id !== edit.remove_incident_id,
    );
    if (incident) {
      incidents.push(structuredClone(incident));
      incidents.sort(compare_incidents);
    }
    const updated: IStoredMatchReport = {
      ...existing,
      status: edit.status,
      home_score: edit.home_score,
      away_score: edit.away_score,
      notes: edit.notes,
      client_revision: edit.client_revision,
      incidents,
      lock_version: existing.lock_version + 1,
      updated_at: now,
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return { outcome: MatchReportWriteOutcome.APPLIED, report: structuredClone(updated) };
  }

  /**
   * Finds a tenant's report for a game.
   * @param tenant_id Owning tenant.
   * @param game_id Game id.
   * @returns The stored row (not a copy), or undefined.
   */
  private find_by_game(tenant_id: string, game_id: string): IStoredMatchReport | undefined {
    return [...this.rows.values()].find(
      (row) => row.tenant_id === tenant_id && row.game_id === game_id,
    );
  }

  /**
   * Tells whether any incident of the tenant already uses an idempotency key.
   * @param tenant_id Owning tenant.
   * @param idempotency_key Key to look for.
   * @returns True when one does, on any of the tenant's reports.
   */
  private key_is_taken(tenant_id: string, idempotency_key: string): boolean {
    return [...this.rows.values()].some(
      (row) =>
        row.tenant_id === tenant_id &&
        row.incidents.some((incident) => incident.idempotency_key === idempotency_key),
    );
  }

  /**
   * Builds the map key of a row.
   * @param tenant_id Owning tenant.
   * @param report_id Report id.
   * @returns A key that cannot collide across the two parts.
   */
  private key_of(tenant_id: string, report_id: string): string {
    return JSON.stringify([tenant_id, report_id]);
  }
}
