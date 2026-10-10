import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IFeedResult } from '../models/feed_result.model';
import { IFeedView } from '../models/feed_view.model';
import { IIssuedFeed } from '../models/issued_feed.model';

/** The calendar feed endpoint. */
const FEED_URL = '/api/my_schedule/feed';

/**
 * The calendar feed endpoints, as Observables. The bearer token is attached by the app-wide
 * interceptor. The feed's secret token is part of exactly two responses, the one that creates the
 * feed and the one that rotates it; callers must not keep it.
 */
@Injectable({ providedIn: 'root' })
export class MyScheduleFeedApiService {
  private readonly http = inject(HttpClient);

  /**
   * Reads the signed-in referee's feed.
   * @returns The feed's status and usage, or null when there is none.
   */
  public get_feed(): Observable<IFeedView | null> {
    return this.http
      .get<IApiEnvelope<IFeedResult>>(FEED_URL)
      .pipe(map((response) => response.data.feed));
  }

  /**
   * Creates the feed. The response carries the token, once.
   * @returns The new feed, its token and the path of its calendar file.
   */
  public create_feed(): Observable<IIssuedFeed> {
    return this.http
      .post<IApiEnvelope<IIssuedFeed>>(FEED_URL, {})
      .pipe(map((response) => response.data));
  }

  /**
   * Replaces the feed's token; the old link stops working at once. The response carries the new
   * token, once.
   * @returns The feed, its new token and the path of its calendar file.
   */
  public rotate_feed(): Observable<IIssuedFeed> {
    return this.http
      .post<IApiEnvelope<IIssuedFeed>>(`${FEED_URL}/rotate`, {})
      .pipe(map((response) => response.data));
  }

  /**
   * Revokes the feed; the link stops working at once.
   * @returns Nothing once the backend has answered.
   */
  public revoke_feed(): Observable<void> {
    return this.http.delete<IApiEnvelope<IFeedResult>>(FEED_URL).pipe(map(() => undefined));
  }
}
