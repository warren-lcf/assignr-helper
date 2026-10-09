import { ICreateMatchReportResult } from '../models/create_match_report_result.model.js';
import { IListMatchReportsQuery } from '../models/list_match_reports_query.model.js';
import { IMatchReportEdit } from '../models/match_report_edit.model.js';
import { IMatchReportWriteResult } from '../models/match_report_write_result.model.js';
import { IStoredMatchReport } from '../models/stored_match_report.model.js';

/**
 * Persistence port for match reports and their incidents. Every method is scoped by `tenant_id`.
 * A report's `lock_version` is the optimistic-concurrency version: every saved edit moves it
 * forward by one, so two writers can never both believe they saw the same version. Incidents are
 * always returned oldest first (`created_at`, then `incident_id`).
 */
export interface IMatchReportStore {
  /**
   * Reads one report of a tenant, with its incidents.
   * @param tenant_id Owning tenant.
   * @param report_id Report id.
   * @returns The report, or null when this tenant has none with that id.
   */
  get_report(tenant_id: string, report_id: string): Promise<IStoredMatchReport | null>;

  /**
   * Reads the report of one game of a tenant, with its incidents.
   * @param tenant_id Owning tenant.
   * @param game_id Game id.
   * @returns The report, or null when this tenant has none for that game.
   */
  get_report_by_game(tenant_id: string, game_id: string): Promise<IStoredMatchReport | null>;

  /**
   * Lists a tenant's reports, with their incidents.
   * @param tenant_id Owning tenant.
   * @param query Status and game filters, and the most reports to return.
   * @returns Reports newest first (`created_at` descending, then `report_id` descending).
   */
  list_reports(tenant_id: string, query: IListMatchReportsQuery): Promise<IStoredMatchReport[]>;

  /**
   * Saves a new report unless the tenant already has one for the same game. Never throws for
   * that reason and never changes the report that exists, so of any number of simultaneous
   * callers exactly one gets `created`.
   * @param report Complete row; it has no incidents yet.
   * @returns The report the game now has, and whether this call stored it.
   * @throws Error when the (`tenant_id`, `report_id`) key is already taken by another game's report.
   */
  create_report_if_absent(report: IStoredMatchReport): Promise<ICreateMatchReportResult>;

  /**
   * Writes an edit compare-and-swap style: only while the report's `lock_version` is still the
   * one the caller read. Never throws for a lost race. The report's fields, the incident change
   * and the version bump are saved together or not at all.
   * @param tenant_id Owning tenant.
   * @param report_id Report id.
   * @param expected_lock_version The `lock_version` the caller last read.
   * @param edit The new field values and at most one incident to add or remove.
   * @param now UTC milliseconds for the report's `updated_at`.
   * @param actor Actor to stamp as the report's `updated_by`.
   * @returns APPLIED with the new report, or why nothing changed.
   * @throws Error when `edit.add_incident` has no team side (the column is NOT NULL); nothing is written.
   */
  apply_edit(
    tenant_id: string,
    report_id: string,
    expected_lock_version: number,
    edit: IMatchReportEdit,
    now: number,
    actor: string,
  ): Promise<IMatchReportWriteResult>;
}
