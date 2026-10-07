import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BEARER_AUTH_INTERCEPTOR_CONFIG } from '@hch-shared-libraries/ui-kit/authorization';
import { app_bearer_auth_interceptor } from './app_bearer_auth_interceptor';

function setup() {
  const get_token = vi.fn(() => Promise.resolve('user-id-token'));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([app_bearer_auth_interceptor])),
      provideHttpClientTesting(),
      { provide: BEARER_AUTH_INTERCEPTOR_CONFIG, useValue: { get_token, url_prefixes: ['/api/'] } },
    ],
  });
  return {
    get_token,
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
  };
}

describe('app_bearer_auth_interceptor', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('sets the Authorization header on ordinary API calls', async () => {
    const { http, controller } = setup();

    http.get('/api/quick_links').subscribe();
    const request = await vi.waitFor(() => {
      const [match] = controller.match('/api/quick_links');
      expect(match).toBeDefined();
      return match;
    });

    expect(request.request.headers.get('Authorization')).toBe('Bearer user-id-token');
  });

  it('never attaches a token to /api/public/ calls, and never even asks for one', () => {
    const { http, controller, get_token } = setup();

    http.get('/api/public/q/some-token/games').subscribe();
    const request = controller.expectOne('/api/public/q/some-token/games');

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(get_token).not.toHaveBeenCalled();
  });

  it('treats the bare /api/public path the same way', () => {
    const { http, controller, get_token } = setup();

    http.get('/api/public').subscribe();
    const request = controller.expectOne('/api/public');

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(get_token).not.toHaveBeenCalled();
  });

  it('still attaches a token to a look-alike path that is not under /api/public/', async () => {
    const { http, controller } = setup();

    http.get('/api/publication').subscribe();
    const request = await vi.waitFor(() => {
      const [match] = controller.match('/api/publication');
      expect(match).toBeDefined();
      return match;
    });

    expect(request.request.headers.get('Authorization')).toBe('Bearer user-id-token');
  });
});
