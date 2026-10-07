import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QUICK_LINK_FIXTURES, make_created_quick_link } from '../mocks/quick_link_view.mock';
import { QuickLinksApiService } from './quick_links_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(QuickLinksApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('QuickLinksApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists the links, unwrapping the data envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_quick_links().subscribe((links) => (result = links));
    const request = http.expectOne('/api/quick_links');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { quick_links: QUICK_LINK_FIXTURES } });

    expect(result).toEqual(QUICK_LINK_FIXTURES);
  });

  it('creates a link with the request body and returns the link, token and path', () => {
    const { api, http } = setup();
    const created = make_created_quick_link();
    let result: unknown;

    api
      .create_quick_link({ scope: { levels: ['Premier'] }, expires_at: 1_790_000_000_000 })
      .subscribe((link) => (result = link));
    const request = http.expectOne('/api/quick_links');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      scope: { levels: ['Premier'] },
      expires_at: 1_790_000_000_000,
    });
    request.flush({ data: created }, { status: 201, statusText: 'Created' });

    expect(result).toEqual(created);
  });

  it('can create an unrestricted link with an empty body', () => {
    const { api, http } = setup();

    api.create_quick_link({}).subscribe();
    const request = http.expectOne('/api/quick_links');
    expect(request.request.body).toEqual({});
    request.flush({ data: make_created_quick_link() });
  });

  it('revokes a link by id and returns the revoked link', () => {
    const { api, http } = setup();
    let result: unknown;

    api.revoke_quick_link('link-1').subscribe((link) => (result = link));
    const request = http.expectOne('/api/quick_links/link-1/revoke');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { quick_link: QUICK_LINK_FIXTURES[2] } });

    expect(result).toEqual(QUICK_LINK_FIXTURES[2]);
  });

  it('encodes the link id in the path', () => {
    const { api, http } = setup();

    api.revoke_quick_link('a/b c').subscribe();
    http.expectOne('/api/quick_links/a%2Fb%20c/revoke').flush({
      data: { quick_link: QUICK_LINK_FIXTURES[2] },
    });
  });
});
