import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IAddConnectionRequest } from '../models/add_connection_request.model';
import { IConnectionTestResult } from '../models/connection_test_result.model';
import { IConnectionView } from '../models/connection_view.model';
import { IReplaceCredentialsRequest } from '../models/replace_credentials_request.model';
import { ISyncRunView } from '../models/sync_run_view.model';

/** Base path of the backend API. */
const API_BASE = '/api';

/** How many recent runs the sync history asks for. */
export const SYNC_RUNS_LIMIT = 20;

/**
 * The connection endpoints of the backend, as Observables. The bearer token is
 * attached by the app-wide interceptor. Credentials travel only in the request
 * bodies of `create_connection` and `replace_credentials`; no response carries
 * one.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lists the tenant's connections.
   * @returns The connections.
   */
  public list_connections(): Observable<IConnectionView[]> {
    return this.http
      .get<IApiEnvelope<{ connections: IConnectionView[] }>>(`${API_BASE}/connections`)
      .pipe(map((response) => response.data.connections));
  }

  /**
   * Connects a provider account with the tenant's own client credentials. The
   * server verifies them with the provider first.
   * @param request Provider, client id and client secret.
   * @returns The new (or reused) connection.
   */
  public create_connection(request: IAddConnectionRequest): Observable<IConnectionView> {
    return this.http
      .post<IApiEnvelope<{ connection: IConnectionView }>>(`${API_BASE}/connections`, request)
      .pipe(map((response) => response.data.connection));
  }

  /**
   * Replaces a connection's credentials (same provider account only).
   * @param connection_id The connection.
   * @param request New secret, and optionally a new client id.
   * @returns The reconnected connection.
   */
  public replace_credentials(
    connection_id: string,
    request: IReplaceCredentialsRequest,
  ): Observable<IConnectionView> {
    return this.http
      .put<IApiEnvelope<{ connection: IConnectionView }>>(
        `${this.connection_url(connection_id)}/credentials`,
        request,
      )
      .pipe(map((response) => response.data.connection));
  }

  /**
   * Tests the stored credentials without changing anything.
   * @param connection_id The connection.
   * @returns Whether they work and, if not, why.
   */
  public test_connection(connection_id: string): Observable<IConnectionTestResult> {
    return this.http
      .post<IApiEnvelope<IConnectionTestResult>>(`${this.connection_url(connection_id)}/test`, {})
      .pipe(map((response) => response.data));
  }

  /**
   * Deletes the stored credentials and marks the connection disconnected.
   * @param connection_id The connection.
   * @returns The disconnected connection.
   */
  public disconnect_connection(connection_id: string): Observable<IConnectionView> {
    return this.http
      .post<IApiEnvelope<{ connection: IConnectionView }>>(
        `${this.connection_url(connection_id)}/disconnect`,
        {},
      )
      .pipe(map((response) => response.data.connection));
  }

  /**
   * Syncs a connection now.
   * @param connection_id The connection.
   * @param refresh_reference_data Also pull organizations and venues.
   * @returns One run per step the sync took.
   */
  public sync_connection(
    connection_id: string,
    refresh_reference_data = false,
  ): Observable<ISyncRunView[]> {
    return this.http
      .post<IApiEnvelope<{ runs: ISyncRunView[] }>>(`${this.connection_url(connection_id)}/sync`, {
        refresh_reference_data,
      })
      .pipe(map((response) => response.data.runs));
  }

  /**
   * Lists a connection's recent sync runs, newest first.
   * @param connection_id The connection.
   * @param limit How many runs to return.
   * @returns The runs.
   */
  public list_sync_runs(
    connection_id: string,
    limit: number = SYNC_RUNS_LIMIT,
  ): Observable<ISyncRunView[]> {
    return this.http
      .get<IApiEnvelope<{ runs: ISyncRunView[] }>>(
        `${this.connection_url(connection_id)}/sync-runs`,
        { params: new HttpParams().set('limit', limit) },
      )
      .pipe(map((response) => response.data.runs));
  }

  private connection_url(connection_id: string): string {
    return `${API_BASE}/connections/${encodeURIComponent(connection_id)}`;
  }
}
