import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { FAKE_UNSUBSCRIBE_TOKEN, READY_INFO } from '../mocks/unsubscribe_info.mock';
import { PublicUnsubscribeApiService } from './public_unsubscribe_api.service';
import { PublicUnsubscribeError } from './public_unsubscribe_error';

const URL = `/api/public/unsubscribe/${FAKE_UNSUBSCRIBE_TOKEN}`;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(PublicUnsubscribeApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('PublicUnsubscribeApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('reads the link with a GET, unwrapping the envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_info(FAKE_UNSUBSCRIBE_TOKEN).subscribe((info) => (result = info));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    request.flush({ data: READY_INFO });

    expect(result).toEqual(READY_INFO);
  });

  it('unsubscribes with a POST', () => {
    const { api, http } = setup();
    let done = false;

    api.unsubscribe(FAKE_UNSUBSCRIBE_TOKEN).subscribe(() => (done = true));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    request.flush({ data: { unsubscribed: true } });

    expect(done).toBe(true);
  });

  it('encodes the token in the path', () => {
    const { api, http } = setup();

    api.get_info('a/b c').subscribe();

    http.expectOne('/api/public/unsubscribe/a%2Fb%20c').flush({ data: READY_INFO });
  });

  it('turns a 404 into a "not valid" error that holds no address', () => {
    const { api, http } = setup();
    let error: unknown;

    api.get_info(FAKE_UNSUBSCRIBE_TOKEN).subscribe({ error: (e: unknown) => (error = e) });
    http
      .expectOne(URL)
      .flush({ code: 'NOT_FOUND', message: 'Nope' }, { status: 404, statusText: 'Not Found' });

    expect(error).toBeInstanceOf(PublicUnsubscribeError);
    expect(error).not.toBeInstanceOf(HttpErrorResponse);
    expect((error as PublicUnsubscribeError).kind).toBe(UnsubscribeErrorKind.NOT_VALID);
    expect(JSON.stringify(error)).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
  });

  it('turns a failed POST into the same sanitized error', () => {
    const { api, http } = setup();
    let error: unknown;

    api.unsubscribe(FAKE_UNSUBSCRIBE_TOKEN).subscribe({ error: (e: unknown) => (error = e) });
    http
      .expectOne(URL)
      .flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect((error as PublicUnsubscribeError).kind).toBe(UnsubscribeErrorKind.RATE_LIMITED);
    expect(String((error as Error).stack)).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
  });

  it('turns a network failure into an unavailable error', () => {
    const { api, http } = setup();
    let error: unknown;

    api.get_info(FAKE_UNSUBSCRIBE_TOKEN).subscribe({ error: (e: unknown) => (error = e) });
    http.expectOne(URL).error(new ProgressEvent('error'));

    expect((error as PublicUnsubscribeError).kind).toBe(UnsubscribeErrorKind.UNAVAILABLE);
  });
});
