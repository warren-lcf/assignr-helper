import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IApiEnvelope } from '../../../core/services/session/api_envelope.model';
import { ICreateContactRequest } from '../models/create_contact_request.model';
import { IEmailContact } from '../models/email_contact.model';
import { IImportContactsRequest } from '../models/import_contacts_request.model';
import { IImportContactsResult } from '../models/import_contacts_result.model';

/** Base path of the contacts endpoints. */
const CONTACTS_URL = '/api/contacts';

/** The contacts endpoints, as Observables. The bearer token is attached by the app-wide interceptor. */
@Injectable({ providedIn: 'root' })
export class EmailContactsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lists the tenant's contacts.
   * @returns The contacts.
   */
  public list_contacts(): Observable<IEmailContact[]> {
    return this.http
      .get<IApiEnvelope<{ contacts: IEmailContact[] }>>(CONTACTS_URL)
      .pipe(map((response) => response.data.contacts));
  }

  /**
   * Adds one contact. The caller attests the contact agreed to these emails.
   * @param request The contact and the consent attestation.
   * @returns The new contact.
   */
  public create_contact(request: ICreateContactRequest): Observable<IEmailContact> {
    return this.http
      .post<IApiEnvelope<{ contact: IEmailContact }>>(CONTACTS_URL, request)
      .pipe(map((response) => response.data.contact));
  }

  /**
   * Adds up to 200 contacts at once. The caller attests they agreed to these emails.
   * @param request The entries and the consent attestation.
   * @returns How many were added, skipped as existing, and refused.
   */
  public import_contacts(request: IImportContactsRequest): Observable<IImportContactsResult> {
    return this.http
      .post<IApiEnvelope<IImportContactsResult>>(`${CONTACTS_URL}/import`, request)
      .pipe(map((response) => response.data));
  }

  /**
   * Deletes a contact.
   * @param contact_id The contact's id.
   * @returns Completes when it is gone.
   */
  public delete_contact(contact_id: string): Observable<void> {
    return this.http
      .delete(`${CONTACTS_URL}/${encodeURIComponent(contact_id)}`)
      .pipe(map(() => undefined));
  }
}
