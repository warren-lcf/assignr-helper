import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { UnsubscribeErrorKind } from '../../enums/unsubscribe_error_kind.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import {
  ALREADY_INFO,
  FAKE_UNSUBSCRIBE_TOKEN,
  READY_INFO,
} from '../../mocks/unsubscribe_info.mock';
import { IUnsubscribeInfo } from '../../models/unsubscribe_info.model';
import { PublicUnsubscribeApiService } from '../../services/public_unsubscribe_api.service';
import { PublicUnsubscribeError } from '../../services/public_unsubscribe_error';
import { PublicUnsubscribePageComponent } from './public_unsubscribe_page.component';

function not_valid(): PublicUnsubscribeError {
  return new PublicUnsubscribeError(UnsubscribeErrorKind.NOT_VALID, 404, 'NOT_FOUND');
}
function rate_limited(): PublicUnsubscribeError {
  return new PublicUnsubscribeError(UnsubscribeErrorKind.RATE_LIMITED, 429, 'RATE_LIMITED');
}
function unavailable(): PublicUnsubscribeError {
  return new PublicUnsubscribeError(UnsubscribeErrorKind.UNAVAILABLE, 500, null);
}

interface IRenderOptions {
  get_info?: () => Observable<IUnsubscribeInfo>;
  unsubscribe?: () => Observable<void>;
}

function render(options: IRenderOptions = {}) {
  const api = {
    get_info: vi.fn(options.get_info ?? (() => of(READY_INFO))),
    unsubscribe: vi.fn(options.unsubscribe ?? (() => of(undefined))),
  };
  TestBed.configureTestingModule({
    imports: [PublicUnsubscribePageComponent],
    providers: [
      { provide: PublicUnsubscribeApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(PublicUnsubscribePageComponent);
  fixture.componentRef.setInput('token', FAKE_UNSUBSCRIBE_TOKEN);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, component: fixture.componentInstance, element, api, settle, by_testid };
}

describe('PublicUnsubscribePageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('shows skeletons while the link is read', () => {
    const pending = new Subject<IUnsubscribeInfo>();
    const { by_testid, element } = render({ get_info: () => pending });

    expect(by_testid('unsubscribe-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('hch-skeleton-line')).not.toBeNull();
    expect(by_testid('unsubscribe-submit')).toBeNull();
  });

  it('reads the link once and shows the masked address with one button, unsubscribing nothing yet', async () => {
    const { api, by_testid, settle } = render();
    await settle();

    expect(api.get_info).toHaveBeenCalledTimes(1);
    expect(api.get_info).toHaveBeenCalledWith(FAKE_UNSUBSCRIBE_TOKEN);
    expect(by_testid('unsubscribe-question')?.textContent).toContain('a***@example.test');
    expect(by_testid('unsubscribe-submit')?.textContent?.trim()).toBe('Unsubscribe');
    expect(api.unsubscribe).not.toHaveBeenCalled();
  });

  it('asks search engines not to index the page, and clears that when it goes away', async () => {
    const { fixture, settle } = render();
    await settle();

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
    fixture.destroy();

    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('unsubscribes on the click and then says so', async () => {
    const { api, by_testid, settle } = render();
    await settle();

    by_testid('unsubscribe-submit')?.click();
    await settle();

    expect(api.unsubscribe).toHaveBeenCalledWith(FAKE_UNSUBSCRIBE_TOKEN);
    expect(by_testid('unsubscribe-done')?.textContent).toContain('You have been unsubscribed');
    expect(by_testid('unsubscribe-done')?.textContent).toContain(
      'a***@example.test will not receive these emails any more.',
    );
    expect(by_testid('unsubscribe-submit')).toBeNull();
  });

  it('sends one request however often the button is pressed while it runs', async () => {
    const pending = new Subject<void>();
    const { api, by_testid, settle, fixture } = render({ unsubscribe: () => pending });
    await settle();

    const button = by_testid('unsubscribe-submit') as HTMLButtonElement;
    button.click();
    button.click();
    fixture.detectChanges();

    expect(api.unsubscribe).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    pending.next();
    pending.complete();
    await settle();

    expect(by_testid('unsubscribe-done')).not.toBeNull();
  });

  it('says the address is already unsubscribed, with no button', async () => {
    const { api, by_testid, settle } = render({ get_info: () => of(ALREADY_INFO) });
    await settle();

    expect(by_testid('unsubscribe-already')?.textContent).toContain('You are already unsubscribed');
    expect(by_testid('unsubscribe-submit')).toBeNull();
    expect(api.unsubscribe).not.toHaveBeenCalled();
  });

  it('shows one calm not-valid page for a link that is not valid', async () => {
    const { by_testid, element, settle } = render({
      get_info: () => throwError(() => not_valid()),
    });
    await settle();

    expect(by_testid('unsubscribe-not-valid')?.textContent).toContain('This link is not valid');
    expect(by_testid('unsubscribe-submit')).toBeNull();
    expect(element.textContent).not.toContain('example.test');
    expect(element.textContent?.toLowerCase()).not.toContain('expired');
  });

  it('switches to the not-valid page when the link is found dead on the click', async () => {
    const { by_testid, settle } = render({ unsubscribe: () => throwError(() => not_valid()) });
    await settle();

    by_testid('unsubscribe-submit')?.click();
    await settle();

    expect(by_testid('unsubscribe-not-valid')).not.toBeNull();
    expect(by_testid('unsubscribe-submit')).toBeNull();
  });

  it('is friendly about too many requests and reads the link again on Try again', async () => {
    let calls = 0;
    const { api, by_testid, settle } = render({
      get_info: () => (++calls === 1 ? throwError(() => rate_limited()) : of(READY_INFO)),
    });
    await settle();

    expect(by_testid('unsubscribe-error')?.textContent).toContain('Too many requests');
    by_testid('unsubscribe-retry')?.click();
    await settle();

    expect(api.get_info).toHaveBeenCalledTimes(2);
    expect(by_testid('unsubscribe-question')).not.toBeNull();
  });

  it('offers Try again after a network or server failure', async () => {
    const { by_testid, settle } = render({ get_info: () => throwError(() => unavailable()) });
    await settle();

    expect(by_testid('unsubscribe-error')?.textContent).toContain('Something went wrong');
    expect(by_testid('unsubscribe-retry')).not.toBeNull();
  });

  it('treats a failure that is not the sanitized kind as unavailable', async () => {
    const { by_testid, settle } = render({ get_info: () => throwError(() => new Error('boom')) });
    await settle();

    expect(by_testid('unsubscribe-error')?.textContent).toContain('Something went wrong');
  });

  it('keeps the button and explains when the click is rate limited, then allows another try', async () => {
    let calls = 0;
    const { api, by_testid, settle } = render({
      unsubscribe: () => (++calls === 1 ? throwError(() => rate_limited()) : of(undefined)),
    });
    await settle();

    by_testid('unsubscribe-submit')?.click();
    await settle();

    expect(by_testid('unsubscribe-submit-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('unsubscribe-submit-error')?.textContent).toContain('Too many requests');
    expect((by_testid('unsubscribe-submit') as HTMLButtonElement).disabled).toBe(false);

    by_testid('unsubscribe-submit')?.click();
    await settle();

    expect(api.unsubscribe).toHaveBeenCalledTimes(2);
    expect(by_testid('unsubscribe-done')).not.toBeNull();
  });

  it('logs only the kind, status and code of a failure, never the token', async () => {
    const { by_testid, settle } = render({
      get_info: () => throwError(() => unavailable()),
    });
    await settle();
    by_testid('unsubscribe-retry')?.click();
    await settle();

    expect(logged).toHaveBeenCalledWith('Could not read the unsubscribe link', {
      kind: UnsubscribeErrorKind.UNAVAILABLE,
      status: 500,
      code: null,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
  });

  it('logs a failed click the same sanitized way', async () => {
    const { by_testid, settle } = render({ unsubscribe: () => throwError(() => unavailable()) });
    await settle();

    by_testid('unsubscribe-submit')?.click();
    await settle();

    expect(logged).toHaveBeenCalledWith('Could not unsubscribe', {
      kind: UnsubscribeErrorKind.UNAVAILABLE,
      status: 500,
      code: null,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
  });

  it('does not unsubscribe twice once done', async () => {
    const { api, component, settle } = render();
    await settle();

    await component.unsubscribe();
    await component.unsubscribe();

    expect(api.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
