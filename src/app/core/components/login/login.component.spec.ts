import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SignInFailure } from '../../enums/sign_in_failure.enum';
import { ISignInResult } from '../../models/sign_in_result.model';
import { IdentityService } from '../../services/identity/identity.service';
import { AppTranslationService } from '../../services/translation/app_translation.service';
import { LoginComponent } from './login.component';

function make_component(result: ISignInResult) {
  const identity = {
    sign_in_with_email: vi.fn(async () => result),
    sign_in_with_google: vi.fn(async () => result),
  };
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([]),
      { provide: IdentityService, useValue: identity },
      { provide: AppTranslationService, useValue: { translate: (key: string) => key } },
    ],
  });
  const fixture = TestBed.createComponent(LoginComponent);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { fixture, component: fixture.componentInstance, identity, navigate };
}

describe('LoginComponent', () => {
  it('renders the shared login page', () => {
    const { fixture } = make_component({ ok: true, failure: null });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('hch-login-page')).not.toBeNull();
  });

  it('signs in with the submitted credentials and lands on the default page', async () => {
    const { component, identity, navigate } = make_component({ ok: true, failure: null });

    await component.on_credentials_submitted({ email: 'alex@example.test', password: 'pw' });

    expect(identity.sign_in_with_email).toHaveBeenCalledWith('alex@example.test', 'pw');
    expect(navigate).toHaveBeenCalledWith('/games');
    expect(component.is_submitting()).toBe(false);
    expect(component.error_message()).toBeUndefined();
  });

  it('signs in with Google', async () => {
    const { component, identity, navigate } = make_component({ ok: true, failure: null });

    await component.on_google_requested();

    expect(identity.sign_in_with_google).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/games');
  });

  it('shows a translated message for a failure and stays on the page', async () => {
    const { component, navigate } = make_component({
      ok: false,
      failure: SignInFailure.INVALID_CREDENTIALS,
    });

    await component.on_credentials_submitted({ email: 'a@b.test', password: 'bad' });

    expect(component.error_message()).toBe('The email or password is not correct.');
    expect(navigate).not.toHaveBeenCalled();
    expect(component.is_submitting()).toBe(false);
  });

  it('clears an earlier error when a new attempt starts', async () => {
    const { component } = make_component({ ok: true, failure: null });
    component.error_message.set('old error');

    await component.on_google_requested();

    expect(component.error_message()).toBeUndefined();
  });

  it('returns to a same-app page the user asked for', async () => {
    const { fixture, component, navigate } = make_component({ ok: true, failure: null });
    fixture.componentRef.setInput('return_url', '/match-reports');

    await component.on_google_requested();

    expect(navigate).toHaveBeenCalledWith('/match-reports');
  });

  it.each(['https://evil.example.com', '//evil.example.com', 'games'])(
    'ignores the unsafe return address %s',
    async (target) => {
      const { fixture, component, navigate } = make_component({ ok: true, failure: null });
      fixture.componentRef.setInput('return_url', target);

      await component.on_google_requested();

      expect(navigate).toHaveBeenCalledWith('/games');
    },
  );
});
