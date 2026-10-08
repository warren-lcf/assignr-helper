import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IEmailSettings } from '../models/email_settings.model';
import { ISaveEmailSettingsRequest } from '../models/save_email_settings_request.model';

/** Path of the sender settings endpoint. */
const SETTINGS_URL = '/api/email/settings';

/**
 * The sender (SendGrid) settings endpoints, as Observables. The bearer token is
 * attached by the app-wide interceptor. The API key travels in exactly one
 * request body, the save; it is never returned, and callers must not keep it.
 */
@Injectable({ providedIn: 'root' })
export class EmailSettingsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Reads the tenant's sender settings (never the API key).
   * @returns The settings.
   */
  public get_settings(): Observable<IEmailSettings> {
    return this.http
      .get<IApiEnvelope<{ settings: IEmailSettings }>>(SETTINGS_URL)
      .pipe(map((response) => response.data.settings));
  }

  /**
   * Saves the sender settings. The API key is required the first time and may
   * be left out afterwards to keep the stored one.
   * @param request The settings, with the write-only API key when it is being set.
   * @returns The settings as saved (without the key).
   */
  public save_settings(request: ISaveEmailSettingsRequest): Observable<IEmailSettings> {
    return this.http
      .put<IApiEnvelope<{ settings: IEmailSettings }>>(SETTINGS_URL, request)
      .pipe(map((response) => response.data.settings));
  }

  /**
   * Removes the sender settings and the stored API key.
   * @returns Completes when they are gone.
   */
  public remove_settings(): Observable<void> {
    return this.http.delete(SETTINGS_URL).pipe(map(() => undefined));
  }
}
