import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IGamesQuery } from '../models/games_query.model';
import { IGamesResult } from '../models/games_result.model';

/** Base path of the backend API. */
const API_BASE = '/api';

/**
 * The games endpoint of the backend, as an Observable. The bearer token is
 * attached by the app-wide interceptor. Games are read-only here.
 */
@Injectable({ providedIn: 'root' })
export class GamesApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lists the tenant's games, grouped by location and date by the backend.
   * The backend rejects unknown parameters, so only the query's own fields
   * are sent, and unset ones are left out.
   * @param query Scope, text search, facets and toggles.
   * @returns The grouped games, their total, and whether the list was cut off.
   */
  public list_games(query: IGamesQuery): Observable<IGamesResult> {
    return this.http
      .get<IApiEnvelope<IGamesResult>>(`${API_BASE}/games`, { params: this.to_params(query) })
      .pipe(map((response) => response.data));
  }

  private to_params(query: IGamesQuery): HttpParams {
    let params = new HttpParams().set('scope', query.scope);
    const text_fields = [
      ['search', query.search],
      ['connection_id', query.connection_id],
      ['organization_id', query.organization_id],
      ['league', query.league],
      ['level', query.level],
      ['age_group', query.age_group],
      ['location_group', query.location_group],
    ] as const;
    for (const [name, value] of text_fields) {
      if (value) params = params.set(name, value);
    }
    params = params
      .set('only_with_open_slots', String(query.only_with_open_slots))
      .set('include_cancelled', String(query.include_cancelled));
    if (query.from !== undefined) params = params.set('from', query.from);
    if (query.to !== undefined) params = params.set('to', query.to);
    return params;
  }
}
