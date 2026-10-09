import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IAddIncidentRequest } from '../models/add_incident_request.model';
import { IMatchReportSummaryView } from '../models/match_report_summary_view.model';
import { IMatchReportView } from '../models/match_report_view.model';
import { IReportsQuery } from '../models/reports_query.model';
import { ISetScoresRequest } from '../models/set_scores_request.model';

/** Base path of the match report endpoints. */
const REPORTS_URL = '/api/match_reports';

/** The answer of every endpoint that returns one report. */
interface IReportBody {
  report: IMatchReportView;
}

/**
 * The match report endpoints, as Observables. The bearer token is attached by the app-wide interceptor.
 * Reads need `games.read`; writes need `reports.write`. Editing is last-writer-wins on the score
 * revision and idempotent on the card key, which is what lets the offline queue retry safely.
 */
@Injectable({ providedIn: 'root' })
export class MatchReportsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Starts the report for a game, or returns the one that already exists (201 or 200).
   * @param game_id The game, which must be one of the caller's.
   * @returns The report.
   */
  public open_report(game_id: string): Observable<IMatchReportView> {
    return this.http
      .post<IApiEnvelope<IReportBody>>(REPORTS_URL, { game_id })
      .pipe(map((response) => response.data.report));
  }

  /**
   * Lists report summaries, newest first as the backend orders them.
   * @param query Optional status and game filters; only the ones set are sent.
   * @returns The summaries.
   */
  public list_reports(query: IReportsQuery = {}): Observable<IMatchReportSummaryView[]> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.game_id) params = params.set('game_id', query.game_id);
    return this.http
      .get<IApiEnvelope<{ reports: IMatchReportSummaryView[] }>>(REPORTS_URL, { params })
      .pipe(map((response) => response.data.reports));
  }

  /**
   * Reads one report with its cards.
   * @param report_id The report's id.
   * @returns The report.
   */
  public get_report(report_id: string): Observable<IMatchReportView> {
    return this.http
      .get<IApiEnvelope<IReportBody>>(this.report_url(report_id))
      .pipe(map((response) => response.data.report));
  }

  /**
   * Sets the final score. A request with a lower revision than the server holds is ignored and the
   * stored report comes back, so a late retry can never undo a newer score.
   * @param report_id The report's id.
   * @param request The scores, notes and the revision.
   * @returns The report as stored.
   */
  public set_scores(report_id: string, request: ISetScoresRequest): Observable<IMatchReportView> {
    return this.http
      .put<IApiEnvelope<IReportBody>>(`${this.report_url(report_id)}/scores`, request)
      .pipe(map((response) => response.data.report));
  }

  /**
   * Adds a card. The same idempotency key sent again answers with the report as it is (200).
   * @param report_id The report's id.
   * @param request The card.
   * @returns The report with the card on it.
   */
  public add_incident(
    report_id: string,
    request: IAddIncidentRequest,
  ): Observable<IMatchReportView> {
    return this.http
      .post<IApiEnvelope<IReportBody>>(`${this.report_url(report_id)}/incidents`, request)
      .pipe(map((response) => response.data.report));
  }

  /**
   * Removes a card. An id the server does not know is a no-op.
   * @param report_id The report's id.
   * @param incident_id The card's id.
   * @returns The report without the card.
   */
  public remove_incident(report_id: string, incident_id: string): Observable<IMatchReportView> {
    return this.http
      .delete<IApiEnvelope<IReportBody>>(
        `${this.report_url(report_id)}/incidents/${encodeURIComponent(incident_id)}`,
      )
      .pipe(map((response) => response.data.report));
  }

  /**
   * Finishes the report. Refused with 422 REPORT_NOT_READY, listing what is missing, when it cannot be.
   * @param report_id The report's id.
   * @returns The report, now READY.
   */
  public mark_ready(report_id: string): Observable<IMatchReportView> {
    return this.http
      .post<IApiEnvelope<IReportBody>>(`${this.report_url(report_id)}/ready`, {})
      .pipe(map((response) => response.data.report));
  }

  /**
   * Opens a READY report for editing again.
   * @param report_id The report's id.
   * @returns The report, back to DRAFT.
   */
  public reopen(report_id: string): Observable<IMatchReportView> {
    return this.http
      .post<IApiEnvelope<IReportBody>>(`${this.report_url(report_id)}/reopen`, {})
      .pipe(map((response) => response.data.report));
  }

  private report_url(report_id: string): string {
    return `${REPORTS_URL}/${encodeURIComponent(report_id)}`;
  }
}
