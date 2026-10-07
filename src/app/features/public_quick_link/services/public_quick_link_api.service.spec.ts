import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { PUBLIC_FAKE_TOKEN, PUBLIC_GAMES_RESULT } from '../mocks/public_games_result.mock';
import { PublicQuickLinkApiService } from './public_quick_link_api.service';
import { PublicQuickLinkError } from './public_quick_link_error';

const GAMES_URL = `/api/public/q/${PUBLIC_FAKE_TOKEN}/games`;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(PublicQuickLinkApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('PublicQuickLinkApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('reads the games of a link, unwrapping the data envelope, with no query when nothing is set', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_games(PUBLIC_FAKE_TOKEN, {}).subscribe((games) => (result = games));
    const request = http.expectOne(GAMES_URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ data: PUBLIC_GAMES_RESULT });

    expect(result).toEqual(PUBLIC_GAMES_RESULT);
  });

  it('sends search and every facet that is set, and leaves out the rest', () => {
    const { api, http } = setup();

    api
      .list_games(PUBLIC_FAKE_TOKEN, {
        search: 'lions',
        level: 'Premier',
        league: 'Fall League',
        location_group: 'Riverside Park',
      })
      .subscribe();
    const request = http.expectOne((candidate) => candidate.url === GAMES_URL);
    expect(request.request.params.keys().sort()).toEqual([
      'league',
      'level',
      'location_group',
      'search',
    ]);
    expect(request.request.params.get('search')).toBe('lions');
    request.flush({ data: PUBLIC_GAMES_RESULT });

    api.list_games(PUBLIC_FAKE_TOKEN, { level: 'Select' }).subscribe();
    const second = http.expectOne((candidate) => candidate.url === GAMES_URL);
    expect(second.request.params.keys()).toEqual(['level']);
    second.flush({ data: PUBLIC_GAMES_RESULT });
  });

  it('encodes the token in the path', () => {
    const { api, http } = setup();

    api.list_games('a/b c', {}).subscribe();

    http.expectOne('/api/public/q/a%2Fb%20c/games').flush({ data: PUBLIC_GAMES_RESULT });
  });

  it('turns a 404 into a "not active" error that holds no address', () => {
    const { api, http } = setup();
    let error: unknown;

    api.list_games(PUBLIC_FAKE_TOKEN, {}).subscribe({ error: (e: unknown) => (error = e) });
    http
      .expectOne(GAMES_URL)
      .flush({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(error).toBeInstanceOf(PublicQuickLinkError);
    expect((error as PublicQuickLinkError).kind).toBe(PublicLinkErrorKind.NOT_ACTIVE);
    expect(JSON.stringify(error)).not.toContain(PUBLIC_FAKE_TOKEN);
    expect((error as PublicQuickLinkError).message).not.toContain(PUBLIC_FAKE_TOKEN);
  });

  it('turns a 429 into a "rate limited" error carrying the Retry-After wait', () => {
    const { api, http } = setup();
    let error: unknown;

    api.list_games(PUBLIC_FAKE_TOKEN, {}).subscribe({ error: (e: unknown) => (error = e) });
    http.expectOne(GAMES_URL).flush(
      { code: 'RATE_LIMITED', message: 'Slow down' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '20' }),
      },
    );

    expect((error as PublicQuickLinkError).kind).toBe(PublicLinkErrorKind.RATE_LIMITED);
    expect((error as PublicQuickLinkError).retry_after_ms).toBe(20_000);
  });

  it('turns a network failure into an "unavailable" error', () => {
    const { api, http } = setup();
    let error: unknown;

    api.list_games(PUBLIC_FAKE_TOKEN, {}).subscribe({ error: (e: unknown) => (error = e) });
    http.expectOne(GAMES_URL).error(new ProgressEvent('error'));

    expect((error as PublicQuickLinkError).kind).toBe(PublicLinkErrorKind.UNAVAILABLE);
  });
});
