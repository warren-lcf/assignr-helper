import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ALICE, CONTACT_FIXTURES } from '../mocks/email_contact.mock';
import { EmailContactsApiService } from './email_contacts_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(EmailContactsApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('EmailContactsApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the contacts, unwrapping the envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_contacts().subscribe((contacts) => (result = contacts));
    const request = http.expectOne('/api/contacts');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { contacts: CONTACT_FIXTURES } });

    expect(result).toEqual(CONTACT_FIXTURES);
  });

  it('adds a contact with the consent attestation and returns it', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .create_contact({
        display_name: 'Alice Archer',
        email_address: 'alice@example.test',
        consent_attested: true,
      })
      .subscribe((contact) => (result = contact));
    const request = http.expectOne('/api/contacts');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      display_name: 'Alice Archer',
      email_address: 'alice@example.test',
      consent_attested: true,
    });
    request.flush({ data: { contact: ALICE } }, { status: 201, statusText: 'Created' });

    expect(result).toEqual(ALICE);
  });

  it('imports entries with the consent attestation and returns the summary', () => {
    const { api, http } = setup();
    let result: unknown;
    const summary = { added: 2, skipped_existing: 1, invalid: [{ row: 3, reason: 'No' }] };

    api
      .import_contacts({
        entries: [
          { email_address: 'a@example.test' },
          { display_name: 'B', email_address: 'b@example.test' },
        ],
        consent_attested: true,
      })
      .subscribe((value) => (result = value));
    const request = http.expectOne('/api/contacts/import');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as { consent_attested: boolean }).consent_attested).toBe(true);
    request.flush({ data: summary });

    expect(result).toEqual(summary);
  });

  it('deletes a contact, encoding the id in the path', () => {
    const { api, http } = setup();
    let done = false;

    api.delete_contact('a/b').subscribe(() => (done = true));
    const request = http.expectOne('/api/contacts/a%2Fb');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { deleted: true } });

    expect(done).toBe(true);
  });
});
