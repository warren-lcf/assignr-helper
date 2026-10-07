import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ToastService } from '@hch-shared-libraries/ui-kit/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { QuickLinkExpiryPreset } from '../../enums/quick_link_expiry_preset.enum';
import { FAKE_TOKEN, make_created_quick_link } from '../../mocks/quick_link_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { ICreateQuickLinkRequest } from '../../models/create_quick_link_request.model';
import { ICreatedQuickLink } from '../../models/created_quick_link.model';
import { QuickLinksApiService } from '../../services/quick_links_api.service';
import { CreateQuickLinkDialogComponent } from './create_quick_link_dialog.component';

const DAY_MS = 86_400_000;

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

function render(create: (request: ICreateQuickLinkRequest) => Observable<ICreatedQuickLink>) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { create_quick_link: vi.fn(create) };
  TestBed.configureTestingModule({
    imports: [CreateQuickLinkDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: QuickLinksApiService, useValue: api },
      { provide: ToastService, useValue: { show_success: vi.fn(), show_error: vi.fn() } },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(CreateQuickLinkDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const submit = async () => {
    by_testid('create-link-submit')?.click();
    await settle();
  };
  const type_date = async (id: string, text: string) => {
    const input = by_testid(id) as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const errors = () =>
    Array.from(element.querySelectorAll('mat-error')).map((node) => node.textContent?.trim());
  return { fixture, element, api, dialog_ref, by_testid, settle, submit, type_date, errors };
}

describe('CreateQuickLinkDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('offers optional levels, a date window and an expiry, defaulting to 30 days', async () => {
    const { element, by_testid, fixture, settle } = render(() => of(make_created_quick_link()));
    await settle();

    expect(element.querySelector('h2')?.textContent).toContain('Create quick link');
    expect(by_testid('create-link-levels')).not.toBeNull();
    expect(by_testid('create-link-date-start')).not.toBeNull();
    expect(by_testid('create-link-date-end')).not.toBeNull();
    expect(by_testid('create-link-expiry')).not.toBeNull();
    expect(fixture.componentInstance.model().expiry).toBe(QuickLinkExpiryPreset.DAYS_30);
    expect(by_testid('create-link-expiry')?.textContent).toContain('In 30 days');
  });

  it('offers the four expiry presets', () => {
    const { fixture } = render(() => of(make_created_quick_link()));

    expect(fixture.componentInstance.expiry_options().map((option) => option.label)).toEqual([
      'Never expires',
      'In 7 days',
      'In 30 days',
      'In 90 days',
    ]);
  });

  it('sends the default 30-day expiry and no scope when nothing else is set', async () => {
    const before = Date.now();
    const { api, submit } = render(() => of(make_created_quick_link()));

    await submit();

    const [request] = api.create_quick_link.mock.calls[0];
    expect(request.scope).toBeUndefined();
    expect(request.expires_at).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
    expect(request.expires_at).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
  });

  it('sends null, explicitly, when "Never expires" is chosen', async () => {
    const { api, fixture, submit } = render(() => of(make_created_quick_link()));

    fixture.componentInstance.model.update((model) => ({
      ...model,
      expiry: QuickLinkExpiryPreset.NEVER,
    }));
    await submit();

    expect(api.create_quick_link).toHaveBeenCalledWith({ expires_at: null });
  });

  it('sends cleaned levels from the chip input', async () => {
    const { api, fixture, submit } = render(() => of(make_created_quick_link()));

    fixture.componentInstance.on_levels_changed([' Premier ', 'premier', 'Select']);
    await submit();

    expect(api.create_quick_link.mock.calls[0][0].scope).toEqual({ levels: ['Premier', 'Select'] });
  });

  it('sends typed dates as UTC-midnight milliseconds', async () => {
    const { api, type_date, submit } = render(() => of(make_created_quick_link()));

    await type_date('create-link-date-start', '10/10/2026');
    await type_date('create-link-date-end', '10/20/2026');
    await submit();

    expect(api.create_quick_link.mock.calls[0][0].scope).toEqual({
      date_start: Date.UTC(2026, 9, 10),
      date_end: Date.UTC(2026, 9, 20),
    });
  });

  it('refuses a last date before the first date, inline, without calling the API', async () => {
    const { api, errors, type_date, submit } = render(() => of(make_created_quick_link()));

    await type_date('create-link-date-start', '10/20/2026');
    await type_date('create-link-date-end', '10/10/2026');
    await submit();

    expect(api.create_quick_link).not.toHaveBeenCalled();
    expect(errors()).toEqual(['The last date cannot be before the first date.']);
  });

  describe('after creation', () => {
    async function create_one() {
      const rendered = render(() => of(make_created_quick_link()));
      await rendered.submit();
      return rendered;
    }

    it('switches to the copy-now panel with the absolute URL and a warning', async () => {
      const { element, by_testid } = await create_one();

      expect(element.querySelector('h2')?.textContent).toContain('Your quick link');
      expect((by_testid('quick-link-created-url') as HTMLInputElement).value).toBe(
        `${document.location.origin}/q/${FAKE_TOKEN}`,
      );
      expect(by_testid('quick-link-created-warning')?.textContent).toContain(
        'It will not be shown again.',
      );
      expect(by_testid('create-link-submit')).toBeNull();
    });

    it('cannot be dismissed by Escape or a click outside, only with Done', async () => {
      const { dialog_ref, by_testid, fixture } = await create_one();

      expect(dialog_ref.disableClose).toBe(true);
      by_testid('quick-link-created-done')?.click();

      expect(dialog_ref.close).toHaveBeenCalledWith(
        fixture.componentInstance.created()?.quick_link,
      );
    });

    it('keeps the token out of storage, the address bar and the console', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      const href = window.location.href;
      await create_one();

      expect(JSON.stringify(Object.entries(localStorage))).not.toContain(FAKE_TOKEN);
      expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(FAKE_TOKEN);
      expect(window.location.href).toBe(href);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_TOKEN);
      }
    });
  });

  describe('failures', () => {
    it('shows the server reason under the matching field and stays open', async () => {
      const { element, by_testid, dialog_ref, errors, submit } = render(() =>
        throwError(() =>
          api_failure(400, 'VALIDATION_ERROR', [
            { path: 'scope.levels', message: 'Too many levels' },
            { path: 'scope.date_start', message: 'Not a valid date' },
          ]),
        ),
      );

      await submit();

      expect(by_testid('create-link-levels-error')?.textContent).toContain('Too many levels');
      expect(errors()).toContain('Not a valid date');
      expect(element.querySelector('h2')?.textContent).toContain('Create quick link');
      expect(dialog_ref.close).not.toHaveBeenCalled();
      expect((by_testid('create-link-submit') as HTMLButtonElement).disabled).toBe(false);
    });

    it('shows a form-level message and logs the real error for any other failure', async () => {
      const failure = api_failure(500, 'INTERNAL');
      const { by_testid, submit } = render(() => throwError(() => failure));

      await submit();

      expect(by_testid('create-link-form-error')?.textContent).toContain(
        'Something went wrong. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Could not create the quick link', failure);
    });

    it('says what to do when the rate limit is hit', async () => {
      const { by_testid, submit } = render(() =>
        throwError(() => api_failure(429, 'RATE_LIMITED')),
      );

      await submit();

      expect(by_testid('create-link-form-error')?.textContent).toContain('Too many requests');
    });
  });

  it('disables both buttons and blocks dismissal while the request is in flight', async () => {
    const pending = new Subject<ICreatedQuickLink>();
    const { by_testid, dialog_ref, fixture } = render(() => pending);

    by_testid('create-link-submit')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const submit = by_testid('create-link-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect((by_testid('create-link-cancel') as HTMLButtonElement).disabled).toBe(true);
    expect(dialog_ref.disableClose).toBe(true);
  });
});
