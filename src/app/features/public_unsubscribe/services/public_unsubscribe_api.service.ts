import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IUnsubscribeInfo } from '../models/unsubscribe_info.model';
import { to_public_unsubscribe_error } from '../utils/to_public_unsubscribe_error';

/** Base path of the public unsubscribe endpoints. They need no sign-in and the app sends no bearer token to them. */
const PUBLIC_UNSUBSCRIBE_URL = '/api/public/unsubscribe';

/**
 * The public unsubscribe endpoints behind the link in an email, as
 * Observables. Every failure is converted into a {@link PublicUnsubscribeError}
 * that holds no address, because the address contains the link secret token.
 * Reading the link changes nothing; only {@link unsubscribe} does.
 */
@Injectable({ providedIn: 'root' })
export class PublicUnsubscribeApiService {
  private readonly http = inject(HttpClient);

  /**
   * Reads what the link is for, with no side effects.
   * @param token The link secret token, from the address bar.
   * @returns The masked address and whether it already unsubscribed.
   */
  public get_info(token: string): Observable<IUnsubscribeInfo> {
    return this.http.get<IApiEnvelope<IUnsubscribeInfo>>(this.url(token)).pipe(
      map((response) => response.data),
      catchError((error: unknown) => throwError(() => to_public_unsubscribe_error(error))),
    );
  }

  /**
   * Unsubscribes the address the link is for. Only called when the visitor
   * presses the button.
   * @param token The link secret token, from the address bar.
   * @returns Completes when the address is unsubscribed.
   */
  public unsubscribe(token: string): Observable<void> {
    return this.http.post<IApiEnvelope<{ unsubscribed: boolean }>>(this.url(token), {}).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => to_public_unsubscribe_error(error))),
    );
  }

  private url(token: string): string {
    return `${PUBLIC_UNSUBSCRIBE_URL}/${encodeURIComponent(token)}`;
  }
}
