import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIGURED_SETTINGS, FAKE_API_KEY } from '../mocks/email_settings.mock';
import { EmailSettingsApiService } from './email_settings_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(EmailSettingsApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('EmailSettingsApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('reads the settings, unwrapping the envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_settings().subscribe((settings) => (result = settings));
    const request = http.expectOne('/api/email/settings');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { settings: CONFIGURED_SETTINGS } });

    expect(result).toEqual(CONFIGURED_SETTINGS);
  });

  it('saves the settings with the key when it is being set, and returns them without it', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .save_settings({ from_email: 'games@example.test', api_key: FAKE_API_KEY })
      .subscribe((settings) => (result = settings));
    const request = http.expectOne('/api/email/settings');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      from_email: 'games@example.test',
      api_key: FAKE_API_KEY,
    });
    request.flush({ data: { settings: CONFIGURED_SETTINGS } });

    expect(result).toEqual(CONFIGURED_SETTINGS);
    expect(JSON.stringify(result)).not.toContain(FAKE_API_KEY);
  });

  it('saves the details alone, leaving the key out entirely', () => {
    const { api, http } = setup();

    api.save_settings({ from_email: 'games@example.test', from_name: null }).subscribe();
    const request = http.expectOne('/api/email/settings');

    expect('api_key' in (request.request.body as object)).toBe(false);
    request.flush({ data: { settings: CONFIGURED_SETTINGS } });
  });

  it('removes the settings', () => {
    const { api, http } = setup();
    let done = false;

    api.remove_settings().subscribe(() => (done = true));
    const request = http.expectOne('/api/email/settings');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { deleted: true } });

    expect(done).toBe(true);
  });
});
