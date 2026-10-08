import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { CLEAN_PREVIEW } from '../mocks/draft_preview.mock';
import { DRAFT_FIXTURES, OPEN_DRAFT } from '../mocks/email_draft.mock';
import { FULL_SEND_RESULT } from '../mocks/send_result.mock';
import { EmailDraftsApiService } from './email_drafts_api.service';

const REQUEST = {
  subject: 'Hello',
  intro: null,
  filters: {},
  include_quick_link: false,
  quick_link_expiry_days: 14,
  recipient_mode: RecipientMode.ALL_CONSENTED,
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(EmailDraftsApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('EmailDraftsApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the drafts, unwrapping the envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_drafts().subscribe((drafts) => (result = drafts));
    const request = http.expectOne('/api/email_drafts');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { drafts: DRAFT_FIXTURES } });

    expect(result).toEqual(DRAFT_FIXTURES);
  });

  it('reads one draft, encoding its id in the path', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_draft('a/b').subscribe((draft) => (result = draft));
    const request = http.expectOne('/api/email_drafts/a%2Fb');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { draft: OPEN_DRAFT } });

    expect(result).toEqual(OPEN_DRAFT);
  });

  it('creates a draft with the request body', () => {
    const { api, http } = setup();
    let result: unknown;

    api.create_draft(REQUEST).subscribe((draft) => (result = draft));
    const request = http.expectOne('/api/email_drafts');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(REQUEST);
    request.flush({ data: { draft: OPEN_DRAFT } }, { status: 201, statusText: 'Created' });

    expect(result).toEqual(OPEN_DRAFT);
  });

  it('replaces a draft', () => {
    const { api, http } = setup();

    api.update_draft('draft-1', REQUEST).subscribe();
    const request = http.expectOne('/api/email_drafts/draft-1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(REQUEST);
    request.flush({ data: { draft: OPEN_DRAFT } });
  });

  it('deletes a draft', () => {
    const { api, http } = setup();
    let done = false;

    api.delete_draft('draft-1').subscribe(() => (done = true));
    const request = http.expectOne('/api/email_drafts/draft-1');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { deleted: true } });

    expect(done).toBe(true);
  });

  it('reads the preview', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_preview('draft-1').subscribe((preview) => (result = preview));
    const request = http.expectOne('/api/email_drafts/draft-1/preview');
    expect(request.request.method).toBe('GET');
    request.flush({ data: CLEAN_PREVIEW });

    expect(result).toEqual(CLEAN_PREVIEW);
  });

  it('sends a test email with an empty body', () => {
    const { api, http } = setup();
    let done = false;

    api.send_test('draft-1').subscribe(() => (done = true));
    const request = http.expectOne('/api/email_drafts/draft-1/test_send');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ data: { sent: true } });

    expect(done).toBe(true);
  });

  it('sends the draft with the recipient count the sender confirmed', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .send_draft('draft-1', { confirm_recipient_count: 2 })
      .subscribe((value) => (result = value));
    const request = http.expectOne('/api/email_drafts/draft-1/send');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ confirm_recipient_count: 2 });
    request.flush({ data: FULL_SEND_RESULT });

    expect(result).toEqual(FULL_SEND_RESULT);
  });
});
