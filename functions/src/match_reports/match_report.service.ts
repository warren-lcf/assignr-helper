import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { apply_incident } from '../domain/match_reports/apply_incident.js';
import { can_mark_ready } from '../domain/match_reports/can_mark_ready.js';
import { MatchReportStatus } from '../domain/match_reports/match_report_status.enum.js';
import { remove_incident } from '../domain/match_reports/remove_incident.js';
import { ReportEditErrorCode } from '../domain/match_reports/report_edit_error_code.enum.js';
import { set_scores } from '../domain/match_reports/set_scores.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IGameStore } from '../sync/ports/game_store.interface.js';
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
import { MATCH_REPORT_LIMITS } from './match_report_limits.constant.js';
import { IAddIncidentInput } from './models/add_incident_input.model.js';
import { IAddIncidentResult } from './models/add_incident_result.model.js';
import { ICreateMatchReportResult } from './models/create_match_report_result.model.js';
import { IMatchReportEdit } from './models/match_report_edit.model.js';
import { ISetScoresInput } from './models/set_scores_input.model.js';
import { IStoredMatchIncident } from './models/stored_match_incident.model.js';
import { IStoredMatchReport } from './models/stored_match_report.model.js';
import { IMatchReportStore } from './ports/match_report_store.interface.js';
import { to_incident_violations } from './to_incident_violations.js';
import { to_ready_violations } from './to_ready_violations.js';

/** Audit resource type for match reports. */
export const MATCH_REPORT_AUDIT_RESOURCE = 'match_report';

/** Dependencies of the match report service. */
export interface IMatchReportServiceOptions {
  reports: IMatchReportStore;
  games: IGameStore;
  audit: AuditLogService;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  generate_id: () => string;
}

/** A decision not to write: the report is already as the request wants it, or the request is stale. */
interface IEditSkipped {
  write: false;
  was_duplicate: boolean;
}

/** A decision to write one edit. */
interface IEditPlanned {
  write: true;
  edit: IMatchReportEdit;
  /** The idempotency key of the incident being added, if any. */
  idempotency_key: string | null;
}

/** What `run_edit` did. */
interface IEditOutcome {
  /** The report before the edit. */
  before: IStoredMatchReport;
  /** The report after the edit, or the report as read when nothing was written. */
  after: IStoredMatchReport;
  wrote: boolean;
  was_duplicate: boolean;
}

/**
 * Lets a referee record the result of a game they officiated: open the game's report, set the
 * score and notes, add and undo cards, and mark the report ready (or reopen it). All rules live in
 * the pure `domain/match_reports` functions; this service reads a report, asks the domain for the
 * result, and saves it.
 *
 * Every write is a compare-and-swap on the report's `lock_version`. After losing a race the
 * service re-reads and decides again (so a delayed duplicate can never overwrite a newer edit),
 * up to a bounded number of attempts. Scores are last-writer-wins by `client_revision`: an edit
 * based on an older revision than the stored one is ignored and the stored report is returned.
 * Adding and removing incidents deliberately leave `client_revision` alone, because incident
 * requests carry no revision and bumping it would make a client's own later score edit look stale.
 *
 * Submitting a report to the scheduling provider is not built (no supported endpoint), so the
 * SUBMITTED and NOT_SUPPORTED statuses are never reached from here.
 */
export class MatchReportService {
  /**
   * Creates the service.
   * @param options Stores, audit log, clock and id generator.
   */
  public constructor(private readonly options: IMatchReportServiceOptions) {}

  /**
   * Opens the report of a game: creates the DRAFT if the game has none, otherwise returns the one
   * it has. Safe to repeat and safe to race.
   * @param actor Who is acting.
   * @param game_id Game to report on.
   * @returns The report and whether this call created it.
   * @throws ReportGameNotFoundError when the game is not the tenant's, not the referee's own, or removed.
   * @throws ReportGameCancelledError when the game was cancelled.
   */
  public async create_for_game(
    actor: IActingUser,
    game_id: string,
  ): Promise<ICreateMatchReportResult> {
    const game = await this.options.games.get_game(actor.tenant_id, game_id);
    if (!game || !game.is_mine || game.removed_at !== null) {
      throw new ReportGameNotFoundError(game_id);
    }
    if (game.status === GameStatus.CANCELLED) {
      throw new ReportGameCancelledError(game_id);
    }
    const existing = await this.options.reports.get_report_by_game(actor.tenant_id, game_id);
    if (existing) {
      return { report: existing, created: false };
    }
    const now = this.options.now();
    return this.options.reports.create_report_if_absent({
      tenant_id: actor.tenant_id,
      report_id: this.options.generate_id(),
      game_id,
      status: MatchReportStatus.DRAFT,
      home_score: null,
      away_score: null,
      notes: null,
      incidents: [],
      client_revision: 0,
      lock_version: 0,
      created_at: now,
      created_by: actor.user_id,
      updated_at: now,
      updated_by: actor.user_id,
    });
  }

  /**
   * Reads one report.
   * @param tenant_id Owning tenant.
   * @param report_id Report id.
   * @returns The report with its incidents.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   */
  public async get_report(tenant_id: string, report_id: string): Promise<IStoredMatchReport> {
    const report = await this.options.reports.get_report(tenant_id, report_id);
    if (!report) {
      throw new MatchReportNotFoundError(report_id);
    }
    return report;
  }

  /**
   * Lists a tenant's reports.
   * @param tenant_id Owning tenant.
   * @param filter Optional status and game filters.
   * @returns Up to 200 reports, newest first.
   */
  public async list_reports(
    tenant_id: string,
    filter: { status: MatchReportStatus | null; game_id: string | null },
  ): Promise<IStoredMatchReport[]> {
    return this.options.reports.list_reports(tenant_id, {
      ...filter,
      limit: MATCH_REPORT_LIMITS.MAX_LISTED_REPORTS,
    });
  }

  /**
   * Sets the scores (and optionally the notes) of a DRAFT report. An edit whose `client_revision`
   * is lower than the stored one is ignored and the stored report is returned unchanged.
   * @param actor Who is acting.
   * @param report_id Report to change.
   * @param input Validated scores, notes and the revision the edit is based on.
   * @returns The report after the edit, or as stored when the edit was stale.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws ReportNotEditableError when the report is not a DRAFT.
   * @throws MatchReportValidationError when the domain refuses a score.
   * @throws ReportConflictError when the report kept changing under every attempt.
   */
  public async set_scores(
    actor: IActingUser,
    report_id: string,
    input: ISetScoresInput,
  ): Promise<IStoredMatchReport> {
    const outcome = await this.run_edit(actor, report_id, (report) => {
      if (input.client_revision < report.client_revision) {
        return { write: false, was_duplicate: false };
      }
      const result = set_scores(report, input.home_score, input.away_score);
      if (result.error_code !== null) {
        throw this.to_edit_error(report_id, result.error_code);
      }
      return {
        write: true,
        idempotency_key: null,
        edit: {
          ...this.unchanged_edit(report),
          home_score: result.report.home_score,
          away_score: result.report.away_score,
          notes: input.notes === undefined ? report.notes : input.notes,
          // Never below the revision the client sent, so an older delayed edit is ignored later.
          client_revision: Math.max(result.report.client_revision, input.client_revision + 1),
        },
      };
    });
    return outcome.after;
  }

  /**
   * Records an incident on a DRAFT report. Repeating a request with the same idempotency key
   * returns the report as it is and adds nothing.
   * @param actor Who is acting.
   * @param report_id Report to change.
   * @param input Validated incident; always has a team side.
   * @returns The report and whether the key had already been applied.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws ReportNotEditableError when the report is not a DRAFT.
   * @throws MatchReportValidationError when the domain refuses the incident.
   * @throws TooManyIncidentsError when the report already holds 60 incidents.
   * @throws IdempotencyKeyConflictError when the key belongs to an incident on another report.
   * @throws ReportConflictError when the report kept changing under every attempt.
   */
  public async add_incident(
    actor: IActingUser,
    report_id: string,
    input: IAddIncidentInput,
  ): Promise<IAddIncidentResult> {
    const incident_id = this.options.generate_id();
    const outcome = await this.run_edit(actor, report_id, (report) => {
      // Oldest first, and strictly after the newest one already there even within a millisecond.
      const newest = report.incidents.reduce(
        (latest, item) => Math.max(latest, item.created_at),
        0,
      );
      const created_at = Math.max(this.options.now(), newest + 1);
      const incident: IStoredMatchIncident = {
        incident_id,
        idempotency_key: input.idempotency_key,
        team_side: input.team_side,
        jersey_number: input.jersey_number,
        incident_type: input.incident_type,
        minute: input.minute,
        reason_code: input.reason_code,
        notes: input.notes,
        created_at,
        created_by: actor.user_id,
        updated_at: created_at,
        updated_by: actor.user_id,
      };
      const result = apply_incident(report, incident);
      if (result.was_duplicate) {
        return { write: false, was_duplicate: true };
      }
      if (result.error_code === ReportEditErrorCode.INCIDENT_INVALID) {
        throw new MatchReportValidationError(to_incident_violations(result.validation_codes));
      }
      if (result.error_code !== null) {
        throw this.to_edit_error(report_id, result.error_code);
      }
      if (report.incidents.length >= MATCH_REPORT_LIMITS.MAX_INCIDENTS_PER_REPORT) {
        throw new TooManyIncidentsError(report_id, MATCH_REPORT_LIMITS.MAX_INCIDENTS_PER_REPORT);
      }
      return {
        write: true,
        idempotency_key: input.idempotency_key,
        edit: { ...this.unchanged_edit(report), add_incident: incident },
      };
    });
    return { report: outcome.after, was_duplicate: outcome.was_duplicate };
  }

  /**
   * Removes an incident from a DRAFT report (undo). Removing an incident the report does not hold
   * succeeds and changes nothing.
   * @param actor Who is acting.
   * @param report_id Report to change.
   * @param incident_id Incident to remove.
   * @returns The report after the removal.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws ReportNotEditableError when the incident exists but the report is not a DRAFT.
   * @throws ReportConflictError when the report kept changing under every attempt.
   */
  public async remove_incident(
    actor: IActingUser,
    report_id: string,
    incident_id: string,
  ): Promise<IStoredMatchReport> {
    const outcome = await this.run_edit(actor, report_id, (report) => {
      if (!report.incidents.some((incident) => incident.incident_id === incident_id)) {
        return { write: false, was_duplicate: false };
      }
      const result = remove_incident(report, incident_id);
      if (result.error_code !== null) {
        throw this.to_edit_error(report_id, result.error_code);
      }
      return {
        write: true,
        idempotency_key: null,
        edit: { ...this.unchanged_edit(report), remove_incident_id: incident_id },
      };
    });
    return outcome.after;
  }

  /**
   * Marks a DRAFT report READY once `can_mark_ready` finds nothing in the way, and audits it.
   * A report that is already READY is returned as it is (no second audit row).
   * @param actor Who is acting.
   * @param report_id Report to mark.
   * @returns The READY report.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws ReportNotReadyError when something blocks it; the report is unchanged.
   * @throws ReportNotEditableError when the report is SUBMITTED or NOT_SUPPORTED.
   * @throws ReportConflictError when the report kept changing under every attempt.
   */
  public async mark_ready(actor: IActingUser, report_id: string): Promise<IStoredMatchReport> {
    return this.change_status(actor, report_id, MatchReportStatus.DRAFT, MatchReportStatus.READY);
  }

  /**
   * Moves a READY report back to DRAFT so it can be edited again, and audits it. A report that is
   * already a DRAFT is returned as it is (no second audit row).
   * @param actor Who is acting.
   * @param report_id Report to reopen.
   * @returns The DRAFT report.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws ReportNotEditableError when the report is SUBMITTED or NOT_SUPPORTED.
   * @throws ReportConflictError when the report kept changing under every attempt.
   */
  public async reopen(actor: IActingUser, report_id: string): Promise<IStoredMatchReport> {
    return this.change_status(actor, report_id, MatchReportStatus.READY, MatchReportStatus.DRAFT);
  }

  /**
   * Moves a report between DRAFT and READY, with the readiness check when it becomes READY.
   * @param actor Who is acting.
   * @param report_id Report to change.
   * @param from The status the report must have for the change to happen.
   * @param to The status to move it to.
   * @returns The report after the change, or as stored when it already had the target status.
   */
  private async change_status(
    actor: IActingUser,
    report_id: string,
    from: MatchReportStatus,
    to: MatchReportStatus,
  ): Promise<IStoredMatchReport> {
    const outcome = await this.run_edit(actor, report_id, (report) => {
      if (report.status === to) {
        return { write: false, was_duplicate: false };
      }
      if (report.status !== from) {
        throw new ReportNotEditableError(report_id);
      }
      if (to === MatchReportStatus.READY) {
        const check = can_mark_ready(report);
        if (!check.ready) {
          throw new ReportNotReadyError(
            report_id,
            check.blockers,
            to_ready_violations(report, check.blockers),
          );
        }
      }
      return {
        write: true,
        idempotency_key: null,
        edit: { ...this.unchanged_edit(report), status: to },
      };
    });
    if (outcome.wrote) {
      await this.audit(actor, outcome.before, outcome.after);
    }
    return outcome.after;
  }

  /**
   * Reads a report, asks `decide` what to do, and writes the result, repeating after a lost race.
   * @param actor Who is acting.
   * @param report_id Report to change.
   * @param decide Decides from the report as read; may throw to refuse the edit.
   * @returns What happened.
   * @throws MatchReportNotFoundError when the tenant has no such report.
   * @throws IdempotencyKeyConflictError when the incident's key belongs to another report.
   * @throws ReportConflictError when every attempt lost its race.
   */
  private async run_edit(
    actor: IActingUser,
    report_id: string,
    decide: (report: IStoredMatchReport) => IEditSkipped | IEditPlanned,
  ): Promise<IEditOutcome> {
    for (let attempt = 0; attempt < MATCH_REPORT_LIMITS.MAX_WRITE_ATTEMPTS; attempt++) {
      const before = await this.get_report(actor.tenant_id, report_id);
      const decision = decide(before);
      if (!decision.write) {
        return {
          before,
          after: before,
          wrote: false,
          was_duplicate: decision.was_duplicate,
        };
      }
      const result = await this.options.reports.apply_edit(
        actor.tenant_id,
        report_id,
        before.lock_version,
        decision.edit,
        this.options.now(),
        actor.user_id,
      );
      switch (result.outcome) {
        case MatchReportWriteOutcome.APPLIED:
          if (result.report) {
            return { before, after: result.report, wrote: true, was_duplicate: false };
          }
          break;
        case MatchReportWriteOutcome.NOT_FOUND:
          throw new MatchReportNotFoundError(report_id);
        case MatchReportWriteOutcome.IDEMPOTENCY_KEY_CONFLICT: {
          // Either a racing request with the same key just landed on this report (then the next
          // attempt sees it and answers as a replay), or the key belongs to another report.
          const latest = await this.get_report(actor.tenant_id, report_id);
          const landed_here = latest.incidents.some(
            (incident) => incident.idempotency_key === decision.idempotency_key,
          );
          if (!landed_here) {
            throw new IdempotencyKeyConflictError();
          }
          break;
        }
        case MatchReportWriteOutcome.LOST_RACE:
          // Someone changed it since we read it: read again and decide again.
          break;
      }
    }
    throw new ReportConflictError(report_id);
  }

  /**
   * Starts an edit that changes nothing, from the report as read.
   * @param report The report as read.
   * @returns An edit carrying the report's current values and no incident change.
   */
  private unchanged_edit(report: IStoredMatchReport): IMatchReportEdit {
    return {
      status: report.status,
      home_score: report.home_score,
      away_score: report.away_score,
      notes: report.notes,
      client_revision: report.client_revision,
      add_incident: null,
      remove_incident_id: null,
    };
  }

  /**
   * Turns a domain refusal into the error the routes answer with.
   * @param report_id Report the edit was for.
   * @param code The domain's reason.
   * @returns The error to throw.
   */
  private to_edit_error(report_id: string, code: ReportEditErrorCode): Error {
    switch (code) {
      case ReportEditErrorCode.REPORT_NOT_EDITABLE:
        return new ReportNotEditableError(report_id);
      case ReportEditErrorCode.SCORE_INVALID:
        return new MatchReportValidationError([
          { path: 'home_score', message: 'Scores must be whole numbers from 0 to 99, or null' },
        ]);
      default:
        return new MatchReportValidationError([
          { path: '', message: 'The edit is not valid for this report' },
        ]);
    }
  }

  /** Audit state is a deliberate allow-list: ids, status, scores and a count, never any notes. */
  private audit_state(report: IStoredMatchReport): object {
    return {
      report_id: report.report_id,
      game_id: report.game_id,
      status: report.status,
      home_score: report.home_score,
      away_score: report.away_score,
      incident_count: report.incidents.length,
    };
  }

  private async audit(
    actor: IActingUser,
    before: IStoredMatchReport,
    after: IStoredMatchReport,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: MATCH_REPORT_AUDIT_RESOURCE,
      resource_id: after.report_id,
      action: AuditAction.UPDATE,
      before_state: this.audit_state(before),
      after_state: this.audit_state(after),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
