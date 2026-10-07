import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from './app_translation.service';

function make_service() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AppTranslationService),
    http: TestBed.inject(HttpTestingController),
  };
}

async function flush_dictionary(
  http: HttpTestingController,
  locale: string,
  body: Record<string, string> | null,
): Promise<void> {
  let request: ReturnType<HttpTestingController['expectOne']> | null = null;
  await vi.waitFor(() => {
    request = http.expectOne(`assets/i18n/${locale}.json`);
  });
  const pending = request as unknown as ReturnType<HttpTestingController['expectOne']>;
  if (body) pending.flush(body);
  else pending.flush('missing', { status: 404, statusText: 'Not Found' });
}

describe('AppTranslationService', () => {
  it('returns the key itself before any dictionary is loaded', () => {
    const { service } = make_service();

    expect(service.translate('Games')).toBe('Games');
    expect(service.is_ready()).toBe(false);
  });

  it('translates from the app dictionary and interpolates parameters', async () => {
    const { service, http } = make_service();

    const loading = service.load_locale('en');
    await flush_dictionary(http, 'en', { Games: 'Matches', 'Hi {{name}}': 'Hello {{name}}' });
    await loading;

    expect(service.translate('Games')).toBe('Matches');
    expect(service.translate('Hi {{name}}', { name: 'Alex' })).toBe('Hello Alex');
    expect(service.translate('Unknown key')).toBe('Unknown key');
    expect(service.active_locale()).toBe('en');
    expect(service.is_ready()).toBe(true);
  });

  it('uses only the primary subtag of a locale', async () => {
    const { service, http } = make_service();

    const loading = service.load_locale('en-US');
    await flush_dictionary(http, 'en', { Games: 'Matches' });
    await loading;

    expect(service.active_locale()).toBe('en');
  });

  it('falls back to English when the locale has no app dictionary', async () => {
    const { service, http } = make_service();

    const loading = service.load_locale('es');
    await flush_dictionary(http, 'es', null);
    await flush_dictionary(http, 'en', { Games: 'Matches' });
    await loading;

    expect(service.active_locale()).toBe('es');
    expect(service.translate('Games')).toBe('Matches');
  });

  it('still becomes ready, and logs, when even the English dictionary is missing', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, http } = make_service();

    const loading = service.load_locale('en');
    await flush_dictionary(http, 'en', null);
    await loading;

    expect(service.is_ready()).toBe(true);
    expect(error_spy).toHaveBeenCalledWith(
      'Failed to load the app dictionary',
      'en',
      expect.anything(),
    );
    error_spy.mockRestore();
  });

  it('switches locale through set_active_locale', async () => {
    const { service, http } = make_service();

    service.set_active_locale('en');
    await flush_dictionary(http, 'en', { Games: 'Matches' });
    await vi.waitFor(() => expect(service.translate('Games')).toBe('Matches'));
  });

  it('logs when set_active_locale cannot load', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = make_service();
    vi.spyOn(service, 'load_locale').mockRejectedValueOnce(new Error('boom'));

    service.set_active_locale('fr');

    await vi.waitFor(() =>
      expect(error_spy).toHaveBeenCalledWith(
        'Failed to load translations',
        'fr',
        expect.any(Error),
      ),
    );
    error_spy.mockRestore();
  });
});
