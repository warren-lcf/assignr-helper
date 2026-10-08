import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { IDraftPreview } from '../models/draft_preview.model';
import { IEmailDraft } from '../models/email_draft.model';
import { ISaveDraftRequest } from '../models/save_draft_request.model';
import { ISendDraftRequest } from '../models/send_draft_request.model';
import { ISendDraftResult } from '../models/send_draft_result.model';

/** Base path of the drafts endpoints. */
const DRAFTS_URL = '/api/email_drafts';

/** The email draft endpoints, as Observables. The bearer token is attached by the app-wide interceptor. */
@Injectable({ providedIn: 'root' })
export class EmailDraftsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lists the tenant's drafts.
   * @returns The drafts.
   */
  public list_drafts(): Observable<IEmailDraft[]> {
    return this.http
      .get<IApiEnvelope<{ drafts: IEmailDraft[] }>>(DRAFTS_URL)
      .pipe(map((response) => response.data.drafts));
  }

  /**
   * Reads one draft.
   * @param draft_id The draft's id.
   * @returns The draft.
   */
  public get_draft(draft_id: string): Observable<IEmailDraft> {
    return this.http
      .get<IApiEnvelope<{ draft: IEmailDraft }>>(this.draft_url(draft_id))
      .pipe(map((response) => response.data.draft));
  }

  /**
   * Creates a draft.
   * @param request The draft's content.
   * @returns The new draft.
   */
  public create_draft(request: ISaveDraftRequest): Observable<IEmailDraft> {
    return this.http
      .post<IApiEnvelope<{ draft: IEmailDraft }>>(DRAFTS_URL, request)
      .pipe(map((response) => response.data.draft));
  }

  /**
   * Replaces a draft's content. Refused with DRAFT_LOCKED once the draft is no longer a draft.
   * @param draft_id The draft's id.
   * @param request The draft's content.
   * @returns The updated draft.
   */
  public update_draft(draft_id: string, request: ISaveDraftRequest): Observable<IEmailDraft> {
    return this.http
      .put<IApiEnvelope<{ draft: IEmailDraft }>>(this.draft_url(draft_id), request)
      .pipe(map((response) => response.data.draft));
  }

  /**
   * Deletes a draft (only while it is still a draft).
   * @param draft_id The draft's id.
   * @returns Completes when it is gone.
   */
  public delete_draft(draft_id: string): Observable<void> {
    return this.http.delete(this.draft_url(draft_id)).pipe(map(() => undefined));
  }

  /**
   * Renders the email a draft would send, with the recipient count and any warnings.
   * @param draft_id The draft's id.
   * @returns The preview.
   */
  public get_preview(draft_id: string): Observable<IDraftPreview> {
    return this.http
      .get<IApiEnvelope<IDraftPreview>>(`${this.draft_url(draft_id)}/preview`)
      .pipe(map((response) => response.data));
  }

  /**
   * Emails the draft to the signed-in user's own address only.
   * @param draft_id The draft's id.
   * @returns Completes when the test email was handed off.
   */
  public send_test(draft_id: string): Observable<void> {
    return this.http.post(`${this.draft_url(draft_id)}/test_send`, {}).pipe(map(() => undefined));
  }

  /**
   * Sends the draft to its recipients. Irreversible. The server refuses it when
   * the recipient count differs from the one the sender confirmed.
   * @param draft_id The draft's id.
   * @param request The recipient count the sender confirmed.
   * @returns How the send went, per recipient.
   */
  public send_draft(draft_id: string, request: ISendDraftRequest): Observable<ISendDraftResult> {
    return this.http
      .post<IApiEnvelope<ISendDraftResult>>(`${this.draft_url(draft_id)}/send`, request)
      .pipe(map((response) => response.data));
  }

  private draft_url(draft_id: string): string {
    return `${DRAFTS_URL}/${encodeURIComponent(draft_id)}`;
  }
}
