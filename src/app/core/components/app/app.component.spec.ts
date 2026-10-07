import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_HEADER_IDENTITY_PROVIDER } from '@hch-shared-libraries/ui-kit/app';
import { IdentityService } from '../../services/identity/identity.service';
import { AppTranslationService } from '../../services/translation/app_translation.service';
import { AppComponent } from './app.component';

function make_app(initial_url = '/games') {
  const identity = {
    is_logged_in: signal<boolean | undefined>(true),
    current_user: signal({ display_name: 'Alex Referee' }),
    sign_out: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: IdentityService, useValue: identity },
      { provide: APP_HEADER_IDENTITY_PROVIDER, useValue: identity },
      { provide: AppTranslationService, useValue: { translate: (key: string) => key } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl');
  return { identity, router, navigate, initial_url };
}

describe('AppComponent', () => {
  it('renders the shared application shell with the app name', async () => {
    const { router } = make_app();
    await router.navigateByUrl('/games');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('hch-app-shell')).not.toBeNull();
    expect(fixture.componentInstance.app_name()).toBe('Assignr Helper');
  });

  it('shows the chrome everywhere except the sign-in page', async () => {
    const { router } = make_app();
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/games');
    expect(fixture.componentInstance.show_chrome()).toBe(true);

    await router.navigateByUrl('/login?return_url=%2Fgames');

    expect(fixture.componentInstance.show_chrome()).toBe(false);
  });

  it('shows no chrome on the public quick link page either', async () => {
    const { router } = make_app();
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/q/some-token');

    expect(fixture.componentInstance.show_chrome()).toBe(false);
  });

  it('does not mistake a similar path for the quick link page', async () => {
    const { router } = make_app();
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/quick-links');

    expect(fixture.componentInstance.show_chrome()).toBe(true);
  });

  it('builds the sidebar from the navigation definitions', () => {
    make_app();
    const fixture = TestBed.createComponent(AppComponent);

    expect(fixture.componentInstance.nav_items().map((item) => item.path)).toContain('/games');
  });

  it('opens the sign-in page on login', async () => {
    const { navigate } = make_app();
    const fixture = TestBed.createComponent(AppComponent);

    await fixture.componentInstance.on_login_clicked();

    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('signs out then returns to the sign-in page on logout', async () => {
    const { identity, navigate } = make_app();
    const fixture = TestBed.createComponent(AppComponent);

    await fixture.componentInstance.on_logout_clicked();

    expect(identity.sign_out).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
