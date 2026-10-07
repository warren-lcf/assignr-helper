import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { ICreateQuickLinkRequest } from '../models/create_quick_link_request.model';
import { ICreatedQuickLink } from '../models/created_quick_link.model';
import { IQuickLinkView } from '../models/quick_link_view.model';
import { IQuickLinksList } from '../models/quick_links_list.model';

/** Base path of the owner endpoints. */
const QUICK_LINKS_URL = '/api/quick_links';

/**
 * The owner-side quick link endpoints, as Observables. The bearer token is
 * attached by the app-wide interceptor. The secret token is part of exactly
 * one response, the one that creates a link; callers must not keep it.
 */
@Injectable({ providedIn: 'root' })
export class QuickLinksApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lists the tenant's quick links, newest first.
   * @returns The links.
   */
  public list_quick_links(): Observable<IQuickLinkView[]> {
    return this.http
      .get<IApiEnvelope<IQuickLinksList>>(QUICK_LINKS_URL)
      .pipe(map((response) => response.data.quick_links));
  }

  /**
   * Creates a quick link. The response carries the token, once.
   * @param request Optional restrictions and expiry.
   * @returns The new link, its token and the path of its public page.
   */
  public create_quick_link(request: ICreateQuickLinkRequest): Observable<ICreatedQuickLink> {
    return this.http
      .post<IApiEnvelope<ICreatedQuickLink>>(QUICK_LINKS_URL, request)
      .pipe(map((response) => response.data));
  }

  /**
   * Revokes a quick link; its public page stops working at once.
   * @param link_id The link's id.
   * @returns The revoked link.
   */
  public revoke_quick_link(link_id: string): Observable<IQuickLinkView> {
    const url = `${QUICK_LINKS_URL}/${encodeURIComponent(link_id)}/revoke`;
    return this.http
      .post<IApiEnvelope<{ quick_link: IQuickLinkView }>>(url, {})
      .pipe(map((response) => response.data.quick_link));
  }
}
