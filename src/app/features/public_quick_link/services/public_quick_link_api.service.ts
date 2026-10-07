import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IPublicGamesQuery } from '../models/public_games_query.model';
import { IPublicGamesResult } from '../models/public_games_result.model';
import { to_public_quick_link_error } from '../utils/to_public_quick_link_error';

/** Base path of the public endpoints. They need no sign-in and the app sends no bearer token to them. */
const PUBLIC_QUICK_LINK_URL = '/api/public/q';

/**
 * The public games endpoint behind a quick link, as an Observable. Every
 * failure is converted into a {@link PublicQuickLinkError} that holds no
 * address, because the address contains the link's secret token.
 */
@Injectable({ providedIn: 'root' })
export class PublicQuickLinkApiService {
  private readonly http = inject(HttpClient);

  /**
   * Reads the live, read-only games of a quick link.
   * @param token The link's secret token, from the address bar.
   * @param query Search text and facet filters; unset ones are left out.
   * @returns The grouped games, when they were read, and the filter choices.
   */
  public list_games(token: string, query: IPublicGamesQuery): Observable<IPublicGamesResult> {
    let params = new HttpParams();
    for (const [name, value] of [
      ['search', query.search],
      ['level', query.level],
      ['league', query.league],
      ['location_group', query.location_group],
    ] as const) {
      if (value) params = params.set(name, value);
    }
    return this.http
      .get<IApiEnvelope<IPublicGamesResult>>(
        `${PUBLIC_QUICK_LINK_URL}/${encodeURIComponent(token)}/games`,
        { params },
      )
      .pipe(
        map((response) => response.data),
        catchError((error: unknown) => throwError(() => to_public_quick_link_error(error))),
      );
  }
}
