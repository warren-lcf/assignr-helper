import type { RolePermissionService } from '@hch-shared-libraries/core-server';
import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { PermissionKey } from '../auth/enums/permission_key.enum.js';
import { require_app_permission } from '../auth/require_app_permission.js';
import { ApiErrorCode } from '../http/enums/api_error_code.enum.js';
import { IViolation } from '../http/models/violation.model.js';
import { parse_with_schema } from '../http/parse_with_schema.js';
import { require_tenant } from '../http/require_tenant.js';
import { send_api_error } from '../http/send_api_error.js';
import { to_acting_user } from '../http/to_acting_user.js';
import { IdempotencyKeyConflictError } from './errors/idempotency_key_conflict.error.js';
import { MatchReportNotFoundError } from './errors/match_report_not_found.error.js';
import { MatchReportValidationError } from './errors/match_report_validation.error.js';
import { ReportConflictError } from './errors/report_conflict.error.js';
import { ReportGameCancelledError } from './errors/report_game_cancelled.error.js';
import { ReportGameNotFoundError } from './errors/report_game_not_found.error.js';
import { ReportNotEditableError } from './errors/report_not_editable.error.js';
import { ReportNotReadyError } from './errors/report_not_ready.error.js';
import { TooManyIncidentsError } from './errors/too_many_incidents.error.js';
import { MatchReportService } from './match_report.service.js';
import { add_incident_body_schema } from './schemas/add_incident_body.schema.js';
import { create_match_report_body_schema } from './schemas/create_match_report_body.schema.js';
import { incident_id_param_schema } from './schemas/incident_id_param.schema.js';
import { list_match_reports_query_schema } from './schemas/list_match_reports_query.schema.js';
import { report_id_param_schema } from './schemas/report_id_param.schema.js';
import { set_scores_body_schema } from './schemas/set_scores_body.schema.js';
import { to_match_report_summary_view } from './views/to_match_report_summary_view.js';
import { to_match_report_view } from './views/to_match_report_view.js';

/** Dependencies of the match report routes. */
export interface IMatchReportsRoutesOptions {
  report_service: MatchReportService;
  permission_service: RolePermissionService;
}

/**
 * Sends the standard 400 for a request that did not parse.
 * @param res Express response.
 * @param violations Field-level problems.
 */
function send_invalid(res: Response, violations: IViolation[]): void {
  send_api_error(res, 400, ApiErrorCode.VALIDATION_ERROR, 'The request is not valid', violations);
}

/**
 * Answers the errors the match report service throws; anything else goes to the 500 handler,
 * which logs it and leaks nothing. No message repeats request data.
 * @param error What was thrown.
 * @param res Express response.
 * @param next Express error hand-off.
 */
function handle_report_error(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof MatchReportNotFoundError) {
    send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Match report not found');
  } else if (error instanceof ReportGameNotFoundError) {
    send_api_error(res, 404, ApiErrorCode.NOT_FOUND, 'Game not found');
  } else if (error instanceof ReportGameCancelledError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.GAME_CANCELLED,
      'This game was cancelled, so it has no report',
    );
  } else if (error instanceof ReportNotEditableError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.REPORT_NOT_EDITABLE,
      'This report can no longer be changed. Reopen it first',
    );
  } else if (error instanceof ReportNotReadyError) {
    send_api_error(
      res,
      422,
      ApiErrorCode.REPORT_NOT_READY,
      'The report is not ready yet',
      error.violations,
    );
  } else if (error instanceof IdempotencyKeyConflictError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.IDEMPOTENCY_KEY_CONFLICT,
      'This idempotency key was already used for another report',
    );
  } else if (error instanceof TooManyIncidentsError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.TOO_MANY_INCIDENTS,
      `A report can hold at most ${error.limit} incidents`,
    );
  } else if (error instanceof ReportConflictError) {
    send_api_error(
      res,
      409,
      ApiErrorCode.REPORT_CONFLICT,
      'The report was changed by someone else. Reload it and try again',
    );
  } else if (error instanceof MatchReportValidationError) {
    send_invalid(res, error.violations);
  } else {
    next(error);
  }
}

/**
 * Builds the routes a referee uses to record the result of a game. Mount after the auth
 * middleware. Reads need `games.read`; every change needs `reports.write`. Submitting a report to
 * the scheduling provider is not available.
 * @openapi
 * /api/match_reports:
 *   post:
 *     summary: Open the report of a game
 *     description: >
 *       Creates the DRAFT report of one of the referee's own games, or returns the one it already
 *       has. Safe to repeat.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [game_id]
 *             properties:
 *               game_id: { type: string }
 *     responses:
 *       200: { description: "data.report: the report the game already had." }
 *       201: { description: "data.report: the report was just created." }
 *       400: { description: Invalid input, or no tenant to act in. }
 *       403: { description: Requires the reports.write permission. }
 *       404: { description: The game is not one of this tenant's own games. }
 *       409: { description: "GAME_CANCELLED: the game was cancelled." }
 *   get:
 *     summary: The tenant's match reports, newest first
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, READY, SUBMITTED, NOT_SUPPORTED] } }
 *       - { in: query, name: game_id, schema: { type: string } }
 *     responses:
 *       200: { description: "data.reports: at most 200 summaries with card counts." }
 *       400: { description: Invalid query, or no tenant to act in. }
 *       403: { description: Requires the games.read permission. }
 * /api/match_reports/{report_id}:
 *   get:
 *     summary: One match report with its incidents
 *     responses:
 *       200: { description: "data.report." }
 *       404: { description: No such report for this tenant. }
 * /api/match_reports/{report_id}/scores:
 *   put:
 *     summary: Set the scores and notes of a draft report
 *     description: >
 *       Last writer wins by client_revision: an edit based on a lower revision than the stored one
 *       is ignored and the stored report is returned with 200. Omit notes to keep them.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [home_score, away_score, client_revision]
 *             properties:
 *               home_score: { type: integer, minimum: 0, maximum: 99, nullable: true }
 *               away_score: { type: integer, minimum: 0, maximum: 99, nullable: true }
 *               notes: { type: string, maxLength: 2000, nullable: true }
 *               client_revision: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: "data.report." }
 *       400: { description: Invalid input. }
 *       404: { description: No such report for this tenant. }
 *       409: { description: "REPORT_NOT_EDITABLE, or REPORT_CONFLICT after repeated races." }
 * /api/match_reports/{report_id}/incidents:
 *   post:
 *     summary: Record a card or other incident
 *     description: >
 *       Idempotent by idempotency_key: repeating a request returns the report with 200 and adds
 *       nothing. The team side is required.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [idempotency_key, team_side, incident_type]
 *             properties:
 *               idempotency_key: { type: string, pattern: "^[A-Za-z0-9_-]{8,64}$" }
 *               team_side: { type: string, enum: [HOME, AWAY] }
 *               incident_type: { type: string, enum: [YELLOW, SECOND_YELLOW, RED, OTHER] }
 *               jersey_number: { type: integer, minimum: 0, maximum: 99, nullable: true }
 *               minute: { type: integer, minimum: 0, maximum: 130, nullable: true }
 *               reason_code: { type: string, maxLength: 64, nullable: true }
 *               notes: { type: string, maxLength: 500, nullable: true }
 *     responses:
 *       200: { description: "data.report: the key had already been applied." }
 *       201: { description: "data.report: the incident was added." }
 *       400: { description: Invalid input. }
 *       404: { description: No such report for this tenant. }
 *       409: { description: "REPORT_NOT_EDITABLE, TOO_MANY_INCIDENTS (60), IDEMPOTENCY_KEY_CONFLICT (key used on another report) or REPORT_CONFLICT." }
 * /api/match_reports/{report_id}/incidents/{incident_id}:
 *   delete:
 *     summary: Undo an incident
 *     description: Idempotent. Removing an incident the report does not hold changes nothing.
 *     responses:
 *       200: { description: "data.report." }
 *       404: { description: No such report for this tenant. }
 *       409: { description: "REPORT_NOT_EDITABLE or REPORT_CONFLICT." }
 * /api/match_reports/{report_id}/ready:
 *   post:
 *     summary: Mark a draft report ready
 *     description: Audited. A report that is already ready is returned as it is.
 *     responses:
 *       200: { description: "data.report." }
 *       404: { description: No such report for this tenant. }
 *       409: { description: "REPORT_NOT_EDITABLE (submitted) or REPORT_CONFLICT." }
 *       422: { description: "REPORT_NOT_READY: violations name each blocker by path (home_score, away_score, incidents[<id>].team_side); the report is unchanged." }
 * /api/match_reports/{report_id}/reopen:
 *   post:
 *     summary: Move a ready report back to draft
 *     description: Audited. A report that is already a draft is returned as it is.
 *     responses:
 *       200: { description: "data.report." }
 *       404: { description: No such report for this tenant. }
 *       409: { description: "REPORT_NOT_EDITABLE (submitted) or REPORT_CONFLICT." }
 * @param options Service and permission resolver.
 * @returns An Express router.
 */
export function create_match_reports_router(options: IMatchReportsRoutesOptions): Router {
  const router = Router();
  const read = require_app_permission(PermissionKey.GAMES_READ, options.permission_service);
  const write = require_app_permission(PermissionKey.REPORTS_WRITE, options.permission_service);

  /**
   * Reads and checks the report id in the path.
   * @param req Express request.
   * @param res Express response, used to send the 400.
   * @returns The report id, or null after the 400 has been sent.
   */
  function read_report_id(req: Request, res: Response): string | null {
    const params = parse_with_schema(report_id_param_schema, req.params);
    if (!params.ok) {
      send_invalid(res, params.violations);
      return null;
    }
    return params.data.report_id;
  }

  /**
   * Wraps a handler that works on one report of the acting tenant: checks the path, finds the
   * tenant, and funnels errors to `handle_report_error`.
   * @param work Does the work and sends the response.
   * @returns The Express handler.
   */
  function on_report(
    work: (context: {
      req: Request;
      res: Response;
      tenant_id: string;
      report_id: string;
    }) => Promise<void>,
  ): RequestHandler {
    return async (req, res, next) => {
      try {
        const report_id = read_report_id(req, res);
        if (report_id === null) return;
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null) return;
        await work({ req, res, tenant_id, report_id });
      } catch (error) {
        handle_report_error(error, res, next);
      }
    };
  }

  router.post('/match_reports', write, async (req, res, next) => {
    try {
      const body = parse_with_schema(create_match_report_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const result = await options.report_service.create_for_game(
        to_acting_user(req, tenant_id),
        body.data.game_id,
      );
      res
        .status(result.created ? 201 : 200)
        .json({ data: { report: to_match_report_view(result.report) } });
    } catch (error) {
      handle_report_error(error, res, next);
    }
  });

  router.get('/match_reports', read, async (req, res, next) => {
    try {
      const query = parse_with_schema(list_match_reports_query_schema, req.query);
      if (!query.ok) {
        send_invalid(res, query.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const reports = await options.report_service.list_reports(tenant_id, query.data);
      res.json({ data: { reports: reports.map(to_match_report_summary_view) } });
    } catch (error) {
      handle_report_error(error, res, next);
    }
  });

  router.get(
    '/match_reports/:report_id',
    read,
    on_report(async ({ res, tenant_id, report_id }) => {
      const report = await options.report_service.get_report(tenant_id, report_id);
      res.json({ data: { report: to_match_report_view(report) } });
    }),
  );

  router.put('/match_reports/:report_id/scores', write, async (req, res, next) => {
    try {
      const report_id = read_report_id(req, res);
      if (report_id === null) return;
      const body = parse_with_schema(set_scores_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const report = await options.report_service.set_scores(
        to_acting_user(req, tenant_id),
        report_id,
        body.data,
      );
      res.json({ data: { report: to_match_report_view(report) } });
    } catch (error) {
      handle_report_error(error, res, next);
    }
  });

  router.post('/match_reports/:report_id/incidents', write, async (req, res, next) => {
    try {
      const report_id = read_report_id(req, res);
      if (report_id === null) return;
      const body = parse_with_schema(add_incident_body_schema, req.body ?? {});
      if (!body.ok) {
        send_invalid(res, body.violations);
        return;
      }
      const tenant_id = require_tenant(req, res);
      if (tenant_id === null) return;
      const result = await options.report_service.add_incident(
        to_acting_user(req, tenant_id),
        report_id,
        body.data,
      );
      res
        .status(result.was_duplicate ? 200 : 201)
        .json({ data: { report: to_match_report_view(result.report) } });
    } catch (error) {
      handle_report_error(error, res, next);
    }
  });

  router.delete(
    '/match_reports/:report_id/incidents/:incident_id',
    write,
    async (req, res, next) => {
      try {
        const params = parse_with_schema(incident_id_param_schema, req.params);
        if (!params.ok) {
          send_invalid(res, params.violations);
          return;
        }
        const tenant_id = require_tenant(req, res);
        if (tenant_id === null) return;
        const report = await options.report_service.remove_incident(
          to_acting_user(req, tenant_id),
          params.data.report_id,
          params.data.incident_id,
        );
        res.json({ data: { report: to_match_report_view(report) } });
      } catch (error) {
        handle_report_error(error, res, next);
      }
    },
  );

  router.post(
    '/match_reports/:report_id/ready',
    write,
    on_report(async ({ req, res, tenant_id, report_id }) => {
      const report = await options.report_service.mark_ready(
        to_acting_user(req, tenant_id),
        report_id,
      );
      res.json({ data: { report: to_match_report_view(report) } });
    }),
  );

  router.post(
    '/match_reports/:report_id/reopen',
    write,
    on_report(async ({ req, res, tenant_id, report_id }) => {
      const report = await options.report_service.reopen(to_acting_user(req, tenant_id), report_id);
      res.json({ data: { report: to_match_report_view(report) } });
    }),
  );

  return router;
}
