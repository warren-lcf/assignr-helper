import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { USED_FEED, make_issued_feed } from '../mocks/feed_view.mock';
import { MyScheduleFeedApiService } from './my_schedule_feed_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(MyScheduleFeedApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('MyScheduleFeedApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('reads the feed, unwrapping the data envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_feed().subscribe((feed) => (result = feed));
    const request = http.expectOne('/api/my_schedule/feed');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { feed: USED_FEED } });

    expect(result).toEqual(USED_FEED);
  });

  it('reads "no feed" as null', () => {
    const { api, http } = setup();
    let result: unknown = 'unset';

    api.get_feed().subscribe((feed) => (result = feed));
    http.expectOne('/api/my_schedule/feed').flush({ data: { feed: null } });

    expect(result).toBeNull();
  });

  it('creates the feed and returns it with its token and path', () => {
    const { api, http } = setup();
    const issued = make_issued_feed();
    let result: unknown;

    api.create_feed().subscribe((value) => (result = value));
    const request = http.expectOne('/api/my_schedule/feed');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ data: issued }, { status: 201, statusText: 'Created' });

    expect(result).toEqual(issued);
  });

  it('rotates the feed and returns the new token and path', () => {
    const { api, http } = setup();
    const issued = make_issued_feed({
      token: 'second-token',
      path: '/api/public/cal/second-token.ics',
    });
    let result: unknown;

    api.rotate_feed().subscribe((value) => (result = value));
    const request = http.expectOne('/api/my_schedule/feed/rotate');
    expect(request.request.method).toBe('POST');
    request.flush({ data: issued });

    expect(result).toEqual(issued);
  });

  it('revokes the feed', () => {
    const { api, http } = setup();
    let completed = false;

    api.revoke_feed().subscribe({ complete: () => (completed = true) });
    const request = http.expectOne('/api/my_schedule/feed');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { feed: null } });

    expect(completed).toBe(true);
  });
});
