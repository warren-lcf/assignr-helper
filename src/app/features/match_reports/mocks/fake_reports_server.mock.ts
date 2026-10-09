import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, defer, map, of, take, throwError } from 'rxjs';
import { ReportStatus } from '../enums/report_status.enum';
import { IAddIncidentRequest } from '../models/add_incident_request.model';
import { IMatchReportSummaryView } from '../models/match_report_summary_view.model';
import { IMatchReportView } from '../models/match_report_view.model';
import { ISetScoresRequest } from '../models/set_scores_request.model';
import { make_report } from './match_report.mock';

/** One call the fake server received. */
export interface IFakeCall {
  /** The API method, such as `set_scores`. */
  name: string;
  /** What it was called with. */
  args: unknown[];
}

/**
 * Builds the HTTP error the real API sends.
 * @param status HTTP status.
 * @param code API error code.
 * @param violations Field problems, for a 422.
 * @returns The error an Observable would fail with.
 */
export function make_api_error(
  status: number,
  code: string,
  violations: { path: string; message: string }[] = [],
): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations } });
}

/**
 * A small stateful stand-in for the match report API, with the behaviour the offline queue relies on:
 * a score request with a lower revision than the stored one is ignored, a card key sent again answers
 * with the report as it is, removing an unknown id is a no-op, and marking ready needs both scores.
 * It has the same method names as `MatchReportsApiService`, so a spec can provide it in its place.
 * Specs can queue failures, and hold the next response back to keep a request in flight.
 */
export class FakeReportsServer {
  /** The report as the server stores it. */
  public report: IMatchReportView;
  /** Every call, in order. */
  public readonly calls: IFakeCall[] = [];
  /** Errors to fail the next calls with, oldest first; a null entry lets that call through. */
  public failures: (unknown | null)[] = [];
  /** What `list_reports` answers with. */
  public summaries: IMatchReportSummaryView[] = [];

  private incident_counter = 0;
  private readonly holds: { gate: Subject<void>; error: unknown }[] = [];

  public constructor(report: IMatchReportView = make_report()) {
    this.report = report;
  }

  /**
   * Keeps the next call in flight until the returned function is called.
   * @param error When given, the call fails with it when released instead of succeeding.
   * @returns Lets that call finish.
   */
  public hold_next(error: unknown = null): () => void {
    const gate = new Subject<void>();
    this.holds.push({ gate, error });
    return () => gate.next();
  }

  /**
   * The names of the calls received so far.
   * @returns For example `['set_scores', 'add_incident']`.
   */
  public names(): string[] {
    return this.calls.map((call) => call.name);
  }

  /** Starts the game's report (or returns the existing one). */
  public open_report(game_id: string): Observable<IMatchReportView> {
    return this.respond('open_report', [game_id], () => this.report);
  }

  /** Lists summaries. */
  public list_reports(): Observable<IMatchReportSummaryView[]> {
    return this.respond('list_reports', [], () => this.summaries);
  }

  /** Reads the report. */
  public get_report(report_id: string): Observable<IMatchReportView> {
    return this.respond('get_report', [report_id], () => this.report);
  }

  /** Sets the scores; a lower revision than the stored one is ignored. */
  public set_scores(report_id: string, request: ISetScoresRequest): Observable<IMatchReportView> {
    return this.respond('set_scores', [report_id, request], () => {
      if (this.report.status !== ReportStatus.DRAFT)
        throw make_api_error(409, 'REPORT_NOT_EDITABLE');
      if (request.client_revision >= this.report.client_revision) {
        this.report = {
          ...this.report,
          home_score: request.home_score,
          away_score: request.away_score,
          notes: request.notes === undefined ? this.report.notes : request.notes,
          client_revision: request.client_revision,
        };
      }
      return this.report;
    });
  }

  /** Adds a card; the same key again leaves the report as it is. */
  public add_incident(
    report_id: string,
    request: IAddIncidentRequest,
  ): Observable<IMatchReportView> {
    return this.respond('add_incident', [report_id, request], () => {
      if (this.report.status !== ReportStatus.DRAFT)
        throw make_api_error(409, 'REPORT_NOT_EDITABLE');
      if (!this.report.incidents.some((item) => item.idempotency_key === request.idempotency_key)) {
        this.report = {
          ...this.report,
          incidents: [
            ...this.report.incidents,
            { ...request, incident_id: `srv-${++this.incident_counter}` },
          ],
        };
      }
      return this.report;
    });
  }

  /** Removes a card; an unknown id changes nothing. */
  public remove_incident(report_id: string, incident_id: string): Observable<IMatchReportView> {
    return this.respond('remove_incident', [report_id, incident_id], () => {
      if (this.report.status !== ReportStatus.DRAFT)
        throw make_api_error(409, 'REPORT_NOT_EDITABLE');
      this.report = {
        ...this.report,
        incidents: this.report.incidents.filter((item) => item.incident_id !== incident_id),
      };
      return this.report;
    });
  }

  /** Marks the report ready, or refuses with the blockers. */
  public mark_ready(report_id: string): Observable<IMatchReportView> {
    return this.respond('mark_ready', [report_id], () => {
      const violations = [
        ...(this.report.home_score === null ? [{ path: 'home_score', message: 'Required' }] : []),
        ...(this.report.away_score === null ? [{ path: 'away_score', message: 'Required' }] : []),
      ];
      if (violations.length > 0) throw make_api_error(422, 'REPORT_NOT_READY', violations);
      this.report = { ...this.report, status: ReportStatus.READY };
      return this.report;
    });
  }

  /** Puts a ready report back to draft. */
  public reopen(report_id: string): Observable<IMatchReportView> {
    return this.respond('reopen', [report_id], () => {
      this.report = { ...this.report, status: ReportStatus.DRAFT };
      return this.report;
    });
  }

  private respond<T>(name: string, args: unknown[], apply: () => T): Observable<T> {
    return defer(() => {
      this.calls.push({ name, args });
      const failure = this.failures.length > 0 ? this.failures.shift() : null;
      if (failure) return throwError(() => failure);
      const hold = this.holds.shift();
      if (hold) {
        return hold.gate.pipe(
          take(1),
          map(() => {
            if (hold.error) throw hold.error;
            return apply();
          }),
        );
      }
      try {
        return of(apply());
      } catch (error) {
        return throwError(() => error);
      }
    });
  }
}
